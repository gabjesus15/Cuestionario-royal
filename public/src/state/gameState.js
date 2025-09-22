// state/gameState.js
export const gameState = {
  roomCode: "",
  currentUser: null,

  room: null,
  playersArr: [],
  playersMap: {},

  game: null,
  gamePhase: "loading",
  currentIndex: 0,
  questionStartAt: null,
  questionDurationMs: 15000,
  scores: {},
  selectedAnswer: null,
  lastRenderedQuestionIndex: -1,

  // timers/cleanup
  timerId: null,
  hostGuardId: null,
  unsubGame: null,
  unsubRoom: null,
};

export function clearGameIntervals() {
  clearInterval(gameState.timerId);
  clearInterval(gameState.hostGuardId);
  gameState.timerId = null;
  gameState.hostGuardId = null;
}
