// state/lobbyState.js
export const lobbyState = {
  currentUser: null,
  roomCode: null,
  room: null,
  unsubRoom: null,
  isHost: false,
};
export function resetLobbyState() {
  if (lobbyState.unsubRoom) { try { lobbyState.unsubRoom(); } catch {} }
  lobbyState.roomCode = null;
  lobbyState.room = null;
  lobbyState.unsubRoom = null;
  lobbyState.isHost = false;
}
