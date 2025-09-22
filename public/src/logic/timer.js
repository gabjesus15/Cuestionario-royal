// logic/timer.js
// Timer UI + host-guard desacoplados. UI solo pinta número; aquí va la cadencia.

import { closeQuestionAsHost, resolveTimestampMs } from '../services/gameService.js';
import { gameState, clearGameIntervals } from '../state/gameState.js';

export function manageQuestionTimer(updateTimerDisplay) {
  clearInterval(gameState.timerId);
  gameState.timerId = null;

  if (gameState.gamePhase !== 'question') {
    updateTimerDisplay(0);
    return;
  }

  gameState.lastRenderedQuestionIndex = gameState.currentIndex;

  const tick = () => {
    const now = Date.now();
    const start = gameState.questionStartAt || now;
    const end = start + gameState.questionDurationMs;
    const left = Math.max(0, Math.ceil((end - now) / 1000));
    updateTimerDisplay(left);
    if (left <= 0) {
      clearInterval(gameState.timerId);
      gameState.timerId = null;
    }
  };

  tick();
  gameState.timerId = setInterval(tick, 200);
}

export function manageHostGuard() {
  clearInterval(gameState.hostGuardId);
  gameState.hostGuardId = null;

  const isHost = gameState.room?.createdBy === gameState.currentUser?.uid;
  if (!isHost || gameState.gamePhase !== 'question') return;

  gameState.hostGuardId = setInterval(() => {
    const now = Date.now();
    const start = resolveTimestampMs(gameState.questionStartAt) || now;
    const end = start + gameState.questionDurationMs;
    if (now >= end) {
      clearInterval(gameState.hostGuardId);
      gameState.hostGuardId = null;
      closeQuestionAsHost(gameState.roomCode).catch(console.error);
    }
  }, 250);
}

export function cleanupGameTimers() {
  clearGameIntervals();
}
