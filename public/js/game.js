// Lógica del juego de trivia
import { database, ensureAuthenticated, ref, set, get, onValue, serverTimestamp } from './firebase.js';

console.log("Importaciones de Firebase cargadas");
console.log("Database:", database);
console.log("ensureAuthenticated:", ensureAuthenticated);

const state = {
  roomCode: "",
  currentUser: null,
  room: null,
  currentQuestion: 0,
  score: { player1: 0, player2: 0 },
  timeLeft: 30,
  gamePhase: "loading", // loading, question, results, finished
  selectedAnswer: null,
  timer: null
};

// Preguntas del juego
const questions = [
  {
    question: "¿Cuál es la capital de Francia?",
    options: ["Londres", "París", "Madrid", "Roma"],
    correct: 1,
    category: "Geografía"
  },
  {
    question: "¿En qué año llegó el hombre a la Luna?",
    options: ["1967", "1969", "1971", "1973"],
    correct: 1,
    category: "Historia"
  },
  {
    question: "¿Cuál es el planeta más grande del sistema solar?",
    options: ["Saturno", "Neptuno", "Júpiter", "Urano"],
    correct: 2,
    category: "Ciencia"
  },
  {
    question: "¿Quién escribió 'Don Quijote de la Mancha'?",
    options: ["Lope de Vega", "Miguel de Cervantes", "Federico García Lorca", "Calderón de la Barca"],
    correct: 1,
    category: "Literatura"
  },
  {
    question: "¿Cuál es el océano más grande del mundo?",
    options: ["Atlántico", "Índico", "Ártico", "Pacífico"],
    correct: 3,
    category: "Geografía"
  }
];

// Inicializar juego
async function initGame() {
  console.log("Iniciando game.js...");
  const params = new URLSearchParams(location.search);
  state.roomCode = params.get('code');
  
  console.log("Código de sala desde URL:", state.roomCode);
  console.log("URL completa:", window.location.href);
  
  if (!state.roomCode) {
    console.error("No se encontró código de sala en la URL");
    alert("Código de sala no encontrado. Redirigiendo al lobby...");
    window.location.href = './index.html';
    return;
  }

  try {
    console.log("Autenticando usuario...");
    state.currentUser = await ensureAuthenticated();
    console.log("Usuario autenticado:", state.currentUser.uid);
    
    console.log("Cargando información de la sala...");
    await loadRoom();
    console.log("Sala cargada:", state.room);
    
    console.log("Suscribiéndose a actualizaciones del juego...");
    subscribeToGame();
    
    console.log("Renderizando interfaz...");
    render();
  } catch (error) {
    console.error("Error detallado al inicializar juego:", error);
    alert("Error al cargar el juego: " + error.message);
    // No redirigir automáticamente para poder ver el error
    // window.location.href = './index.html';
  }
}

async function loadRoom() {
  console.log("Cargando sala con código:", state.roomCode);
  
  try {
    const roomRef = ref(database, `rooms/${state.roomCode}`);
    console.log("Referencia de sala creada");
    
    const snapshot = await get(roomRef);
    console.log("Snapshot obtenido, existe:", snapshot.exists());
    
    if (snapshot.exists()) {
      state.room = snapshot.val();
      console.log("Datos de sala:", state.room);
      
      if (state.room.players) {
        state.room.players = Object.values(state.room.players);
        console.log("Jugadores procesados:", state.room.players);
      }
      
      // Verificar si ya hay un juego en progreso
      const gameRef = ref(database, `games/${state.roomCode}`);
      const gameSnapshot = await get(gameRef);
      console.log("Juego existente:", gameSnapshot.exists());
      
      if (gameSnapshot.exists()) {
        const gameData = gameSnapshot.val();
        console.log("Datos del juego:", gameData);
        updateGameState(gameData);
      }
    } else {
      console.error("La sala no existe en Firebase");
      throw new Error("La sala no existe o ha expirado");
    }
  } catch (error) {
    console.error("Error en loadRoom:", error);
    throw error;
  }
}

function isHost() {
  return state.room?.createdBy === state.currentUser?.uid;
}

function subscribeToGame() {
  const gameRef = ref(database, `games/${state.roomCode}`);
  onValue(gameRef, (snapshot) => {
    if (snapshot.exists()) {
      const gameData = snapshot.val();
      updateGameState(gameData);
    }
  });
}

function updateGameState(gameData) {
  if (gameData.currentQuestion !== undefined) {
    state.currentQuestion = gameData.currentQuestion;
  }
  if (gameData.scores) {
    state.score = gameData.scores;
  }
  if (gameData.phase) {
    state.gamePhase = gameData.phase;
  }
  render();
}

async function startGameLogic() {
  console.log("Iniciando juego...");
  try {
    const gameRef = ref(database, `games/${state.roomCode}`);
    await set(gameRef, {
      currentQuestion: 0,
      phase: "question",
      scores: { player1: 0, player2: 0 },
      startedAt: serverTimestamp(),
      questions: questions.map((_, index) => ({ questionIndex: index, answers: {} }))
    });
    
    console.log("Juego iniciado correctamente");
    state.gamePhase = "question";
    state.currentQuestion = 0;
    state.timeLeft = 30;
    render();
  } catch (error) {
    console.error("Error al iniciar juego:", error);
    alert("Error al iniciar el juego: " + error.message);
  }
}

async function submitAnswer(answerIndex) {
  if (state.selectedAnswer !== null) return;
  
  state.selectedAnswer = answerIndex;
  const isCorrect = answerIndex === questions[state.currentQuestion].correct;
  
  // Guardar respuesta en Firebase
  const answerRef = ref(database, `games/${state.roomCode}/questions/${state.currentQuestion}/answers/${state.currentUser.uid}`);
  await set(answerRef, {
    answer: answerIndex,
    correct: isCorrect,
    timestamp: serverTimestamp()
  });

  render();
  
  // Esperar un momento para mostrar la respuesta y continuar
  setTimeout(async () => {
    if (state.currentQuestion < questions.length - 1) {
      await nextQuestion();
    } else {
      await finishGame();
    }
  }, 2000);
}

async function nextQuestion() {
  state.currentQuestion++;
  state.selectedAnswer = null;
  state.timeLeft = 30;
  
  const gameRef = ref(database, `games/${state.roomCode}/currentQuestion`);
  await set(gameRef, state.currentQuestion);
  
  startTimer();
  render();
}

async function finishGame() {
  state.gamePhase = "finished";
  const gameRef = ref(database, `games/${state.roomCode}/phase`);
  await set(gameRef, "finished");
  render();
}

function startTimer() {
  if (state.timer) clearInterval(state.timer);
  
  state.timer = setInterval(() => {
    state.timeLeft--;
    updateTimerDisplay();
    
    if (state.timeLeft <= 0) {
      clearInterval(state.timer);
      if (state.selectedAnswer === null) {
        submitAnswer(-1); // Respuesta por tiempo agotado
      }
    }
  }, 1000);
}

function updateTimerDisplay() {
  const timerEl = document.getElementById('timer');
  if (timerEl) {
    timerEl.textContent = state.timeLeft;
    timerEl.className = state.timeLeft <= 10 ? 'timer warning' : 'timer';
  }
}

function render() {
  const view = document.getElementById('view');
  console.log("Renderizando fase:", state.gamePhase);
  
  if (state.gamePhase === "loading") {
    view.innerHTML = renderLoading();
  } else if (state.gamePhase === "question") {
    view.innerHTML = renderQuestion();
    startTimer();
  } else if (state.gamePhase === "finished") {
    view.innerHTML = renderResults();
  }
  
  // Agregar event listeners después de un pequeño delay para asegurar que el DOM se actualice
  setTimeout(() => {
    // Event listeners para respuestas
    document.querySelectorAll('.answer-btn').forEach((btn, index) => {
      btn.addEventListener('click', () => submitAnswer(index));
    });
    
    // Event listener para botón de inicio
    const startBtn = document.getElementById('startGameBtn');
    if (startBtn) {
      console.log("Agregando listener al botón de inicio");
      startBtn.addEventListener('click', (e) => {
        e.preventDefault();
        console.log("Botón de inicio clickeado");
        startGameLogic();
      });
    }
  }, 10);
}

function renderLoading() {
  const canStart = isHost() && state.room?.players?.length >= 2;
  
  return `
    <div class="card center">
      <h1>🎯 Preparando Batalla</h1>
      <div class="players-info">
        ${state.room?.players?.map(p => `
          <div class="player-card">
            <span class="avatar">${p.avatar}</span>
            <strong>${escapeHtml(p.name)}</strong>
            ${p.role === 'host' ? '<small style="color: #fbbf24;">👑 Anfitrión</small>' : ''}
          </div>
        `).join('') || ''}
      </div>
      
      ${canStart ? `
        <button id="startGameBtn" class="button accent mt-4">🚀 ¡Comenzar Trivia!</button>
      ` : `
        <div class="mt-4">
          ${!isHost() ? `
            <p class="muted">Esperando que el anfitrión inicie la partida...</p>
          ` : `
            <p class="muted">Esperando más jugadores...</p>
          `}
        </div>
      `}
    </div>
  `;
}

function renderQuestion() {
  const question = questions[state.currentQuestion];
  const progress = Math.round(((state.currentQuestion + 1) / questions.length) * 100);
  
  return `
    <div class="card">
      <div class="game-header">
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${progress}%"></div>
        </div>
        <div class="question-info">
          <span class="category">${question.category}</span>
          <span class="question-number">Pregunta ${state.currentQuestion + 1}/${questions.length}</span>
          <span id="timer" class="timer">${state.timeLeft}</span>
        </div>
      </div>
      
      <h2 class="question-text">${escapeHtml(question.question)}</h2>
      
      <div class="answers-grid">
        ${question.options.map((option, index) => `
          <button class="answer-btn ${getAnswerClass(index)}" ${state.selectedAnswer !== null ? 'disabled' : ''}>
            <span class="option-letter">${String.fromCharCode(65 + index)}</span>
            <span class="option-text">${escapeHtml(option)}</span>
          </button>
        `).join('')}
      </div>
      
      <div class="scores">
        ${state.room?.players?.map((player, index) => `
          <div class="score-card">
            <span class="avatar">${player.avatar}</span>
            <span class="name">${escapeHtml(player.name)}</span>
            <span class="score">${state.score[`player${index + 1}`] || 0}</span>
          </div>
        `).join('') || ''}
      </div>
    </div>
  `;
}

function getAnswerClass(index) {
  if (state.selectedAnswer === null) return '';
  
  const question = questions[state.currentQuestion];
  if (index === question.correct) return 'correct';
  if (index === state.selectedAnswer && index !== question.correct) return 'incorrect';
  return 'disabled';
}

function renderResults() {
  const winner = state.score.player1 > state.score.player2 ? 
    state.room?.players?.[0] : state.room?.players?.[1];
  
  return `
    <div class="card center">
      <h1>🏆 ¡Batalla Finalizada!</h1>
      
      <div class="winner-section">
        <div class="winner-card">
          <span class="avatar big">${winner?.avatar || '👑'}</span>
          <h2>¡${escapeHtml(winner?.name || 'Campeón')} Ganó!</h2>
          <p class="score-final">${Math.max(state.score.player1, state.score.player2)} puntos</p>
        </div>
      </div>
      
      <div class="final-scores">
        ${state.room?.players?.map((player, index) => `
          <div class="final-score-card">
            <span class="avatar">${player.avatar}</span>
            <span class="name">${escapeHtml(player.name)}</span>
            <span class="score">${state.score[`player${index + 1}`] || 0}</span>
          </div>
        `).join('') || ''}
      </div>
      
      <div class="game-actions">
        <a href="./index.html" class="button primary">🏠 Volver al Lobby</a>
        <button class="button secondary" onclick="location.reload()">🔄 Nueva Partida</button>
      </div>
    </div>
  `;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Inicializar cuando se carga la página
document.addEventListener('DOMContentLoaded', initGame);