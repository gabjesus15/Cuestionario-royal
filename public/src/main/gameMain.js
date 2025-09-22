// main/gameMain.js
// Orquesta suscripciones/estado y delega a UI + timer/guard.

import { ensureUser, getRoom, getGame, subscribeRoom, subscribeGame, resolveTimestampMs } from '../services/gameService.js';
import { gameState, clearGameIntervals } from '../state/gameState.js';
import { manageQuestionTimer, manageHostGuard, cleanupGameTimers } from '../logic/timer.js';
import { render } from '../ui/renderGame.js';
import { hydrateRoomCodeFromQuery } from '../utils/navigation.js';

document.addEventListener('DOMContentLoaded', initGame);

async function initGame() {
  const view = document.getElementById('view');

  gameState.roomCode = hydrateRoomCodeFromQuery();
  if (!gameState.roomCode) {
    alert("Código de sala no encontrado. Redirigiendo al lobby...");
    window.location.href = './index.html';
    return;
  }

  try {
    gameState.currentUser = await ensureUser();

    await loadRoomOnce();
    await loadGameOnce();

    subscribeToRoom();
    subscribeToGame();

    render(view);
  } catch (error) {
    console.error("Error al cargar el juego:", error);
    alert("Error al cargar el juego: " + error.message);
  }
}

// ---- cargas puntuales ----
async function loadRoomOnce() {
  const r = await getRoom(gameState.roomCode);
  if (!r) throw new Error("La sala no existe o ha expirado");
  setRoomFromSnapshot(r);
}

async function loadGameOnce() {
  const g = await getGame(gameState.roomCode);
  if (g) setGameFromSnapshot(g);
  else {
    gameState.game = null;
    gameState.gamePhase = "loading";
  }
}

// ---- suscripciones ----
function subscribeToRoom() {
  gameState.unsubRoom = subscribeRoom(gameState.roomCode, (room) => {
    if (room) setRoomFromSnapshot(room);
    const view = document.getElementById('view');
    render(view);
  });
}

function subscribeToGame() {
  gameState.unsubGame = subscribeGame(gameState.roomCode, (g) => {
    if (!g) {
      gameState.game = null;
      gameState.gamePhase = "loading";
    } else {
      setGameFromSnapshot(g);
    }
    const view = document.getElementById('view');
    render(view);
  });
}

// ---- setters de estado ----
function setRoomFromSnapshot(roomData) {
  gameState.room = roomData || null;
  const players = roomData?.players || null;

  if (players && typeof players === 'object') {
    gameState.playersMap = players;
    gameState.playersArr = Object.values(players);
  } else if (Array.isArray(players)) {
    gameState.playersArr = players;
    gameState.playersMap = (players || []).reduce((acc, p) => { if (p?.id) acc[p.id] = p; return acc; }, {});
  } else {
    gameState.playersArr = [];
    gameState.playersMap = {};
  }
}

function setGameFromSnapshot(gameData) {
  gameState.game = gameData;
  gameState.gamePhase = gameData.phase || "loading";
  gameState.currentIndex = Number.isInteger(gameData.currentIndex)
    ? gameData.currentIndex
    : (Number.isInteger(gameData.currentQuestion) ? gameData.currentQuestion : 0);

  gameState.questionDurationMs = typeof gameData.questionDurationMs === 'number'
    ? gameData.questionDurationMs : 15000;

  gameState.scores = gameData.scores || {};
  gameState.questionStartAt = resolveTimestampMs(gameData.questionStartAt || gameData.startedAt);

  if (gameState.lastRenderedQuestionIndex !== gameState.currentIndex && gameState.gamePhase === 'question') {
    gameState.selectedAnswer = null;
  }

  // timers sincronizados
  manageQuestionTimer(updateTimerDisplay);
  manageHostGuard();
}

function updateTimerDisplay(secondsLeft) {
  const timerEl = document.getElementById('timer');
  if (!timerEl) return;
  timerEl.textContent = secondsLeft;
  timerEl.className = secondsLeft <= 5 ? 'timer warning' : 'timer';
}

// ---- limpieza ----
window.addEventListener('beforeunload', () => {
  cleanupGameTimers();
  if (gameState.unsubGame) gameState.unsubGame();
  if (gameState.unsubRoom) gameState.unsubRoom();
});
