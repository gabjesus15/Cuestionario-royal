// Lógica del juego de trivia (versión robusta y sincronizada)
// - Host como autoridad para cerrar rondas y avanzar
// - Timer sincronizado con serverTimestamp
// - Puntuación por UID (no player1/player2)
// - Limpieza de listeners/timers para evitar duplicados

import {
  database,
  ensureAuthenticated,
  ref,
  get,
  set,
  update,
  onValue,
  off,
  runTransaction,
  serverTimestamp,
} from './firebase.js';

console.log("Importaciones de Firebase cargadas");
console.log("Database:", database);
console.log("ensureAuthenticated:", ensureAuthenticated);

const state = {
  roomCode: "",
  currentUser: null,

  room: null,             // objeto de sala (original desde DB)
  playersArr: [],         // [{id, name, avatar, role, ...}]
  playersMap: {},         // { uid: player }

  game: null,             // snapshot de games/{code}
  gamePhase: "loading",   // 'loading' | 'question' | 'reveal' | 'finished'
  currentIndex: 0,        // índice de pregunta actual
  questionStartAt: null,  // epoch ms (o timestamp firebase) de inicio de pregunta
  questionDurationMs: 30000,
  scores: {},             // { uid: number }
  selectedAnswer: null,   // índice seleccionado por el usuario local
  lastRenderedQuestionIndex: -1,

  timerId: null,          // intervalo UI (cliente) para pintar countdown
  hostGuardId: null,      // intervalo solo host para cerrar la ronda al expirar
  unsubGame: null,        // función para desuscribir game
  unsubRoom: null,        // función para desuscribir room
};

// Banco local de preguntas (se sella al iniciar partida en DB para todos)
const questions = [
  {
    question: "¿Cuál es la capital de Francia?",
    options: ["Londres", "París", "Madrid", "Roma"],
    correct: 1,
    category: "Geografía",
  },
  {
    question: "¿En qué año llegó el hombre a la Luna?",
    options: ["1967", "1969", "1971", "1973"],
    correct: 1,
    category: "Historia",
  },
  {
    question: "¿Cuál es el planeta más grande del sistema solar?",
    options: ["Saturno", "Neptuno", "Júpiter", "Urano"],
    correct: 2,
    category: "Ciencia",
  },
  {
    question: "¿Quién escribió 'Don Quijote de la Mancha'?",
    options: ["Lope de Vega", "Miguel de Cervantes", "Federico García Lorca", "Calderón de la Barca"],
    correct: 1,
    category: "Literatura",
  },
  {
    question: "¿Cuál es el océano más grande del mundo?",
    options: ["Atlántico", "Índico", "Ártico", "Pacífico"],
    correct: 3,
    category: "Geografía",
  },
];

// ---------- Bootstrap ----------
document.addEventListener('DOMContentLoaded', initGame);

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

    console.log("Cargando información inicial de la sala y juego...");
    await loadRoomOnce();
    await loadGameOnce();

    console.log("Suscribiéndose a actualizaciones en tiempo real...");
    subscribeToRoom();
    subscribeToGame();

    console.log("Renderizando interfaz inicial...");
    render();
  } catch (error) {
    console.error("Error detallado al inicializar juego:", error);
    alert("Error al cargar el juego: " + error.message);
  }
}

// ---------- Carga inicial (una sola vez) ----------
async function loadRoomOnce() {
  const roomRef = ref(database, `rooms/${state.roomCode}`);
  const snapshot = await get(roomRef);
  if (!snapshot.exists()) {
    throw new Error("La sala no existe o ha expirado");
  }
  setRoomFromSnapshot(snapshot.val());
}

async function loadGameOnce() {
  const gameRef = ref(database, `games/${state.roomCode}`);
  const snapshot = await get(gameRef);
  if (snapshot.exists()) {
    setGameFromSnapshot(snapshot.val());
  } else {
    // No hay juego inicializado aún → seguimos en loading esperando que el host inicie.
    state.game = null;
    state.gamePhase = "loading";
  }
}

// ---------- Suscripciones ----------
function subscribeToRoom() {
  const roomRef = ref(database, `rooms/${state.roomCode}`);
  const unsub = onValue(roomRef, (snap) => {
    if (snap.exists()) {
      setRoomFromSnapshot(snap.val());
      render();
    }
  });
  state.unsubRoom = () => off(roomRef, 'value', unsub);
}

function subscribeToGame() {
  const gameRef = ref(database, `games/${state.roomCode}`);
  const unsub = onValue(gameRef, (snap) => {
    if (!snap.exists()) {
      // El juego podría no existir hasta que el host lo inicie
      state.game = null;
      state.gamePhase = "loading";
    } else {
      setGameFromSnapshot(snap.val());
    }
    render();
  });
  state.unsubGame = () => off(gameRef, 'value', unsub);
}

// ---------- Helpers de estado ----------
function setRoomFromSnapshot(roomData) {
  state.room = roomData || null;
  const players = roomData?.players || null;
  // Normaliza jugadores (conservar ids)
  if (players && typeof players === 'object') {
    state.playersMap = players;
    state.playersArr = Object.values(players);
  } else if (Array.isArray(players)) {
    // Por compatibilidad con versiones previas
    state.playersArr = players;
    state.playersMap = (players || []).reduce((acc, p) => {
      if (p?.id) acc[p.id] = p;
      return acc;
    }, {});
  } else {
    state.playersArr = [];
    state.playersMap = {};
  }
}

function setGameFromSnapshot(gameData) {
  state.game = gameData;
  state.gamePhase = gameData.phase || "loading";
  state.currentIndex = Number.isInteger(gameData.currentIndex)
    ? gameData.currentIndex
    : (Number.isInteger(gameData.currentQuestion) ? gameData.currentQuestion : 0); // compat

  state.questionDurationMs = typeof gameData.questionDurationMs === 'number'
    ? gameData.questionDurationMs
    : 30000;

  state.scores = gameData.scores || {};
  state.questionStartAt = resolveTimestampMs(gameData.questionStartAt || gameData.startedAt);

  // Si entramos a una pregunta nueva, resetea selección local
  if (state.lastRenderedQuestionIndex !== state.currentIndex && state.gamePhase === 'question') {
    state.selectedAnswer = null;
  }

  // Manejo de timers sincronizados
  manageQuestionTimer();
  manageHostGuard();
}

function resolveTimestampMs(ts) {
  // ts puede ser un número (ms) o un objeto con {seconds, nanoseconds}
  if (!ts) return null;
  if (typeof ts === 'number') return ts;
  if (typeof ts === 'object' && typeof ts.seconds === 'number') {
    return ts.seconds * 1000 + Math.floor((ts.nanoseconds || 0) / 1e6);
  }
  return null;
}

function isHost() {
  return state.room?.createdBy === state.currentUser?.uid;
}

// ---------- Lógica de juego autoritativa ----------
async function startGameLogic() {
  if (!isHost()) return;

  // Sella el set de preguntas en DB para todos
  const sealedQuestions = questions.map((q, i) => ({
    questionIndex: i,
    category: q.category,
    text: q.question,
    options: q.options,
    correctIndex: q.correct,
  }));

  // Inicializa puntuaciones por uid (0)
  const scores = {};
  for (const p of state.playersArr) {
    if (p?.id) scores[p.id] = 0;
  }

  const gameRef = ref(database, `games/${state.roomCode}`);
  await set(gameRef, {
    phase: "question",
    currentIndex: 0,
    questionStartAt: serverTimestamp(),
    questionDurationMs: 30000,
    questions: sealedQuestions,
    answers: {},   // answers[qIndex][uid] = { answer, ts }
    scores,
    startedAt: serverTimestamp(),
  });

  // Estado local se actualizará por el listener
}

async function submitAnswer(answerIndex) {
  if (state.gamePhase !== 'question') return;
  if (state.selectedAnswer !== null) return;

  state.selectedAnswer = answerIndex;

  const q = state.currentIndex;
  const uid = state.currentUser.uid;
  const answerRef = ref(database, `games/${state.roomCode}/answers/${q}/${uid}`);

  await set(answerRef, {
    answer: answerIndex,
    ts: serverTimestamp(),
  });

  // No avanzamos localmente. El host cerrará la pregunta y cambiará la fase.
  render();
}

async function closeQuestionAsHost() {
  // Solo host y solo si estamos en phase=question
  if (!isHost() || state.gamePhase !== 'question') return;

  const code = state.roomCode;
  const baseRef = ref(database, `games/${code}`);

  await runTransaction(baseRef, (g) => {
    if (!g) return g;
    if (g.phase !== 'question') return g;

    const qIndex = Number.isInteger(g.currentIndex) ? g.currentIndex : 0;
    const answers = (g.answers && g.answers[qIndex]) ? g.answers[qIndex] : {};
    const questions = g.questions || [];
    const currentQ = questions[qIndex];

    if (!currentQ) {
      // No hay pregunta: termina el juego
      g.phase = 'finished';
      return g;
    }

    const correct = currentQ.correctIndex;
    g.scores = g.scores || {};

    // Ganadores: aciertan, ordenados por ts asc → el primero (más rápido) suma 1
    let winners = [];
    for (const [uid, a] of Object.entries(answers)) {
      if (a && Number.isInteger(a.answer) && a.answer === correct) {
        winners.push([uid, tsToMs(a.ts)]);
      }
    }
    winners.sort((a, b) => a[1] - b[1]);

    if (winners.length) {
      const [fastestUid] = winners[0];
      g.scores[fastestUid] = (g.scores[fastestUid] || 0) + 1;
    }

    // Pasar a reveal por 2s; luego el host hará el avance
    g.phase = 'reveal';
    g.revealStartAt = serverTimestamp();
    return g;
  });

  // Programar el paso a la siguiente pregunta (o fin) tras la revelación
  setTimeout(async () => {
    // Relee el juego para decidir siguiente fase
    const snap = await get(baseRef);
    if (!snap.exists()) return;
    const g = snap.val();

    const total = (g.questions || []).length;
    const nextIndex = (Number.isInteger(g.currentIndex) ? g.currentIndex : 0) + 1;

    const updates = {};
    if (nextIndex < total) {
      updates.phase = 'question';
      updates.currentIndex = nextIndex;
      updates.questionStartAt = serverTimestamp();
    } else {
      updates.phase = 'finished';
    }

    await update(baseRef, updates);
  }, 2000);
}

function tsToMs(ts) {
  if (!ts) return Number.MAX_SAFE_INTEGER;
  if (typeof ts === 'number') return ts;
  if (typeof ts === 'object' && typeof ts.seconds === 'number') {
    return ts.seconds * 1000 + Math.floor((ts.nanoseconds || 0) / 1e6);
  }
  return Number.MAX_SAFE_INTEGER;
}

// ---------- Timers sincronizados ----------
function manageQuestionTimer() {
  // UI timer: deriva el tiempo restante de (start + dur) - now
  clearInterval(state.timerId);
  state.timerId = null;

  if (state.gamePhase !== 'question') {
    updateTimerDisplay(0); // si no hay pregunta activa, muestra 0/oculta
    return;
  }

  state.lastRenderedQuestionIndex = state.currentIndex;

  const tick = () => {
    const now = Date.now();
    const start = state.questionStartAt || now;
    const end = start + state.questionDurationMs;
    const left = Math.max(0, Math.ceil((end - now) / 1000));
    updateTimerDisplay(left);

    if (left <= 0) {
      clearInterval(state.timerId);
      state.timerId = null;
    }
  };

  tick();
  state.timerId = setInterval(tick, 200);
}

function manageHostGuard() {
  // El host corre un guardián para cerrar la pregunta al expirar
  clearInterval(state.hostGuardId);
  state.hostGuardId = null;

  if (!isHost() || state.gamePhase !== 'question') return;

  state.hostGuardId = setInterval(() => {
    const now = Date.now();
    const start = state.questionStartAt || now;
    const end = start + state.questionDurationMs;

    if (now >= end) {
      clearInterval(state.hostGuardId);
      state.hostGuardId = null;
      // Al expirar, el host cierra la pregunta (puntúa y pasa a reveal)
      closeQuestionAsHost().catch(console.error);
    }
  }, 250);
}

// ---------- Render/UI ----------
function render() {
  const view = document.getElementById('view');
  if (!view) return;

  if (state.gamePhase === "loading") {
    view.innerHTML = renderLoading();
  } else if (state.gamePhase === "question") {
    view.innerHTML = renderQuestion();
  } else if (state.gamePhase === "reveal") {
    view.innerHTML = renderReveal();
  } else if (state.gamePhase === "finished") {
    view.innerHTML = renderResults();
  }

  bindEvents(view);
}

function bindEvents(root) {
  // Delegación para respuestas
  root.addEventListener('click', (ev) => {
    const btn = ev.target.closest('.answer-btn');
    if (btn) {
      const idx = Number(btn.dataset.index);
      if (Number.isInteger(idx)) {
        submitAnswer(idx).catch(console.error);
      }
    }
  });

  // Botón de inicio (solo en loading si host)
  const startBtn = root.querySelector('#startGameBtn');
  if (startBtn) {
    startBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (isHost()) startGameLogic().catch(console.error);
    });
  }
}

function renderLoading() {
  const canStart = isHost() && state.playersArr.length >= 2;

  return `
    <div class="card center">
      <h1>🎯 Preparando Batalla</h1>
      <div class="players-info">
        ${state.playersArr.map(p => `
          <div class="player-card">
            <span class="avatar">${p.avatar || '🙂'}</span>
            <strong>${escapeHtml(p.name || 'Jugador')}</strong>
            ${p.role === 'host' ? '<small style="color: #fbbf24;">👑 Anfitrión</small>' : ''}
          </div>
        `).join('')}
      </div>

      ${canStart ? `
        <button id="startGameBtn" class="button accent mt-4">🚀 ¡Comenzar Trivia!</button>
      ` : `
        <div class="mt-4">
          ${!isHost()
            ? `<p class="muted">Esperando que el anfitrión inicie la partida...</p>`
            : `<p class="muted">Esperando más jugadores...</p>`
          }
        </div>
      `}
    </div>
  `;
}

function renderQuestion() {
  const qObj = getQuestionObject();
  const total = getTotalQuestions();
  const progress = total > 0 ? Math.round(((state.currentIndex + 1) / total) * 100) : 0;

  // Tiempo restante derivado (para pintar el número inicial)
  const now = Date.now();
  const start = state.questionStartAt || now;
  const left = Math.max(0, Math.ceil(((start + state.questionDurationMs) - now) / 1000));

  return `
    <div class="card">
      <div class="game-header">
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${progress}%"></div>
        </div>
        <div class="question-info">
          <span class="category">${escapeHtml(qObj.category || '')}</span>
          <span class="question-number">Pregunta ${state.currentIndex + 1}/${total}</span>
          <span id="timer" class="timer">${left}</span>
        </div>
      </div>

      <h2 class="question-text">${escapeHtml(qObj.text || qObj.question || '')}</h2>

      <div class="answers-grid">
        ${(qObj.options || []).map((option, index) => `
          <button
            class="answer-btn ${getAnswerClass(index, qObj)}"
            data-index="${index}"
            ${state.selectedAnswer !== null ? 'disabled' : ''}>
            <span class="option-letter">${String.fromCharCode(65 + index)}</span>
            <span class="option-text">${escapeHtml(option)}</span>
          </button>
        `).join('')}
      </div>

      <div class="scores">
        ${state.playersArr.map(p => `
          <div class="score-card">
            <span class="avatar">${p.avatar || '🙂'}</span>
            <span class="name">${escapeHtml(p.name || 'Jugador')}</span>
            <span class="score">${state.scores?.[p.id] || 0}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderReveal() {
  const qObj = getQuestionObject();

  return `
    <div class="card center">
      <h1>🔎 Respuesta correcta</h1>
      <p class="muted">${escapeHtml(qObj.text || qObj.question || '')}</p>

      <div class="answers-grid reveal">
        ${(qObj.options || []).map((option, index) => `
          <div class="answer-btn ${index === qObj.correctIndex ? 'correct' : ''}">
            <span class="option-letter">${String.fromCharCode(65 + index)}</span>
            <span class="option-text">${escapeHtml(option)}</span>
          </div>
        `).join('')}
      </div>

      <div class="scores mt-4">
        ${state.playersArr.map(p => `
          <div class="score-card">
            <span class="avatar">${p.avatar || '🙂'}</span>
            <span class="name">${escapeHtml(p.name || 'Jugador')}</span>
            <span class="score">${state.scores?.[p.id] || 0}</span>
          </div>
        `).join('')}
      </div>

      <p class="muted mt-2">Preparando la siguiente pregunta...</p>
    </div>
  `;
}

function renderResults() {
  // Ganador por puntuación
  let winner = null;
  let best = -Infinity;
  for (const p of state.playersArr) {
    const s = state.scores?.[p.id] || 0;
    if (s > best) {
      best = s;
      winner = p;
    }
  }

  const maxScore = best >= 0 ? best : 0;

  return `
    <div class="card center">
      <h1>🏆 ¡Batalla Finalizada!</h1>

      <div class="winner-section">
        <div class="winner-card">
          <span class="avatar big">${winner?.avatar || '👑'}</span>
          <h2>¡${escapeHtml(winner?.name || 'Campeón')} Ganó!</h2>
          <p class="score-final">${maxScore} puntos</p>
        </div>
      </div>

      <div class="final-scores">
        ${state.playersArr.map(p => `
          <div class="final-score-card">
            <span class="avatar">${p.avatar || '🙂'}</span>
            <span class="name">${escapeHtml(p.name || 'Jugador')}</span>
            <span class="score">${state.scores?.[p.id] || 0}</span>
          </div>
        `).join('')}
      </div>

      <div class="game-actions">
        <a href="./index.html" class="button primary">🏠 Volver al Lobby</a>
        <button class="button secondary" onclick="location.reload()">🔄 Nueva Partida</button>
      </div>
    </div>
  `;
}

// ---------- Utilidades ----------
function updateTimerDisplay(secondsLeft) {
  const timerEl = document.getElementById('timer');
  if (!timerEl) return;
  timerEl.textContent = secondsLeft;
  timerEl.className = secondsLeft <= 10 ? 'timer warning' : 'timer';
}

function getQuestionObject() {
  // Preferir la versión sellada en DB
  const g = state.game;
  const index = state.currentIndex;
  const qDb = g?.questions?.[index];
  if (qDb) return qDb;

  // Compatibilidad: usa el banco local si no existe en DB
  const qLocal = questions[index] || {};
  return {
    questionIndex: index,
    category: qLocal.category,
    text: qLocal.question,
    options: qLocal.options,
    correctIndex: qLocal.correct,
  };
}

function getTotalQuestions() {
  if (Array.isArray(state.game?.questions)) return state.game.questions.length;
  return questions.length;
}

function getAnswerClass(index, qObj) {
  if (state.selectedAnswer === null) return '';
  if (index === qObj.correctIndex) return 'correct';
  if (index === state.selectedAnswer && index !== qObj.correctIndex) return 'incorrect';
  return 'disabled';
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = String(text ?? '');
  return div.innerHTML;
}

// ---------- Limpieza (opcional si navegas) ----------
window.addEventListener('beforeunload', () => {
  clearInterval(state.timerId);
  clearInterval(state.hostGuardId);
  if (state.unsubGame) state.unsubGame();
  if (state.unsubRoom) state.unsubRoom();
});
