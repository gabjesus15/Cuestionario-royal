// ui/renderGame.js
// Sub-vistas del juego (loading, question, reveal, results) + bindEvents.

import { escapeHtml } from '../utils/escapeHtml.js';
import { submitAnswer as svcSubmit } from '../services/gameService.js';
import { gameState } from '../state/gameState.js';
import { startMatch } from '../services/lobbyService.js';
import { DEFAULT_QUESTIONS, toSealedQuestions } from '../logic/questions.js';

export function render(root) {
  if (gameState.gamePhase === "loading") {
    root.innerHTML = renderLoading();
  } else if (gameState.gamePhase === "question") {
    root.innerHTML = renderQuestion();
  } else if (gameState.gamePhase === "reveal") {
    root.innerHTML = renderReveal();
  } else if (gameState.gamePhase === "finished") {
    root.innerHTML = renderResults();
  }
  bindEvents(root);
}

function bindEvents(root) {
  root.addEventListener('click', (ev) => {
    const btn = ev.target.closest('.answer-btn');
    if (btn) {
      const idx = Number(btn.dataset.index);
      if (Number.isInteger(idx)) {
        submitAnswer(idx).catch(console.error);
      }
    }
  });

  const startBtn = root.querySelector('#startGameBtn');
  if (startBtn) {
    startBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      const isHost = gameState.room?.createdBy === gameState.currentUser?.uid;
      const canStart = isHost && gameState.playersArr.length >= 2;
      if (!canStart) return alert('Solo el anfitrión y con 2 jugadores pueden iniciar.');

      try {
        await startMatch(
          gameState.roomCode,
          toSealedQuestions(DEFAULT_QUESTIONS),
          10000   // misma duración por pregunta que en el lobby
        );
        // No hace falta redirigir: la suscripción a /games lo detecta
      } catch (err) {
        console.error('No se pudo iniciar desde game:', err);
        alert('No se pudo iniciar la partida. Intenta desde el lobby.');
      }
    });
  }
}

function renderLoading() {
  const canStart = (gameState.room?.createdBy === gameState.currentUser?.uid) && gameState.playersArr.length >= 2;
  return `
    <div class="card center">
      <h1>🎯 Preparando Batalla</h1>
      <div class="players-info">
        ${gameState.playersArr.map(p => `
          <div class="player-card">
            <span class="avatar">${p.avatar || '🙂'}</span>
            <strong class="name">${escapeHtml(p.name || 'Jugador')}</strong>
            ${p.role === 'host' ? '<small style="color: #fbbf24;">👑 Anfitrión</small>' : ''}
          </div>
        `).join('')}
      </div>
      ${canStart ? `<button id="startGameBtn" class="button accent mt-4">🚀 ¡Comenzar Trivia!</button>` : `<div class="mt-4"><p class="muted">Esperando que el anfitrión inicie la partida...</p></div>`}
    </div>
  `;
}

function renderQuestion() {
  const qObj = getQuestionObject();
  const total = getTotalQuestions();
  const progress = total > 0 ? Math.round(((gameState.currentIndex + 1) / total) * 100) : 0;

  const now = Date.now();
  const start = gameState.questionStartAt || now;
  const left = Math.max(0, Math.ceil(((start + gameState.questionDurationMs) - now) / 1000));

  return `
    <div class="card">
      <div class="game-header">
        <div class="progress-bar"><div class="progress-fill" style="width:${progress}%"></div></div>
        <div class="question-info">
          <span class="category">${escapeHtml(qObj.category || '')}</span>
          <span class="question-number">Pregunta ${gameState.currentIndex + 1}/${total}</span>
          <span id="timer" class="timer">${left}</span>
        </div>
      </div>

      <h2 class="question-text">${escapeHtml(qObj.text || '')}</h2>

      <div class="answers-grid">
        ${(qObj.options || []).map((option, index) => `
          <button class="answer-btn ${getAnswerClass(index, qObj)}" data-index="${index}" ${gameState.selectedAnswer !== null ? 'disabled' : ''}>
            <span class="option-letter">${String.fromCharCode(65 + index)}</span>
            <span class="option-text">${escapeHtml(option)}</span>
          </button>
        `).join('')}
      </div>

      <div class="scores">
        ${gameState.playersArr.map(p => `
          <div class="score-card">
            <span class="avatar">${p.avatar || '🙂'}</span>
            <span class="name">${escapeHtml(p.name || 'Jugador')}</span>
            <span class="score">${gameState.scores?.[p.id] || 0}</span>
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
      <p class="muted">${escapeHtml(qObj.text || '')}</p>

      <div class="answers-grid reveal">
        ${(qObj.options || []).map((option, index) => `
          <div class="answer-btn ${index === qObj.correctIndex ? 'correct' : ''}">
            <span class="option-letter">${String.fromCharCode(65 + index)}</span>
            <span class="option-text">${escapeHtml(option)}</span>
          </div>
        `).join('')}
      </div>

      <div class="scores mt-4">
        ${gameState.playersArr.map(p => `
          <div class="score-card">
            <span class="avatar">${p.avatar || '🙂'}</span>
            <span class="name">${escapeHtml(p.name || 'Jugador')}</span>
            <span class="score">${gameState.scores?.[p.id] || 0}</span>
          </div>
        `).join('')}
      </div>

      <p class="muted mt-2">Preparando la siguiente pregunta...</p>
    </div>
  `;
}

function renderResults() {
  let winner = null, best = -Infinity;
  for (const p of gameState.playersArr) {
    const s = gameState.scores?.[p.id] || 0;
    if (s > best) { best = s; winner = p; }
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
        ${gameState.playersArr.map(p => `
          <div class="final-score-card">
            <span class="avatar">${p.avatar || '🙂'}</span>
            <span class="name">${escapeHtml(p.name || 'Jugador')}</span>
            <span class="score">${gameState.scores?.[p.id] || 0}</span>
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

// ----- helpers (idénticos a tu versión) -----
function getQuestionObject() {
  const g = gameState.game;
  const index = gameState.currentIndex;
  const qDb = g?.questions?.[index];
  return qDb || { questionIndex: index, category: '', text: '', options: [], correctIndex: -1 };
}
function getTotalQuestions() {
  return Array.isArray(gameState.game?.questions) ? gameState.game.questions.length : 0;
}
function getAnswerClass(index, qObj) {
  if (gameState.selectedAnswer === null) return '';
  if (index === qObj.correctIndex) return 'correct';
  if (index === gameState.selectedAnswer && index !== qObj.correctIndex) return 'incorrect';
  return 'disabled';
}
async function submitAnswer(answerIndex) {
  if (gameState.gamePhase !== 'question') return;
  if (gameState.selectedAnswer !== null) return;
  gameState.selectedAnswer = answerIndex;
  await svcSubmit(gameState.roomCode, gameState.currentIndex, gameState.currentUser.uid, answerIndex);
}
