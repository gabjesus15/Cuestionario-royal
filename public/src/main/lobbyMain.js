// main/lobbyMain.js
// Bootstrap (auth), hydrateFromQuery, enterLobby, wiring y navegación.

import { ensureAuthenticated } from '../services/firebaseClient.js';
import { createRoom, joinRoom, subscribeRoom, getRoomOnce, addAI, startMatch, startGame } from '../services/lobbyService.js';
import { renderHome } from '../ui/renderHome.js';
import { renderLobby, renderLobbyGone } from '../ui/renderLobby.js';
import { lobbyState, resetLobbyState } from '../state/lobbyState.js';
import { hydrateRoomCodeFromQuery, goToGame } from '../utils/navigation.js';

document.addEventListener('DOMContentLoaded', init);

async function init() {
  try {
    lobbyState.currentUser = await ensureAuthenticated();
  } catch (e) {
    console.error('No se pudo autenticar:', e);
    alert('Error de autenticación');
    return;
  }

  const view = document.getElementById('view');
  const roomCodeFromQuery = hydrateRoomCodeFromQuery();

  renderHome(view, { onEnterLobby: enterLobby });

  if (roomCodeFromQuery) {
    await enterLobby(roomCodeFromQuery);
  }
}

async function enterLobby(code) {
  cleanupRoomSub();
  lobbyState.roomCode = code;

  const room = await getRoomOnce(code);
  if (!room) {
    alert('La sala no existe o ha expirado');
    return;
  }
  lobbyState.room = room;
  lobbyState.isHost = room.createdBy === lobbyState.currentUser?.uid;

  const panel = document.getElementById('lobbyPanel');
  if (panel) renderLobby(panel, lobbyState);

  lobbyState.unsubRoom = subscribeRoom(code, (next) => {
    if (!next) {
      console.warn('Sala eliminada');
      if (panel) renderLobbyGone(panel);
      return;
    }
    lobbyState.room = next;
    lobbyState.isHost = next.createdBy === lobbyState.currentUser?.uid;
    if (panel) renderLobby(panel, lobbyState);

    if (next.status === 'in_progress') {
      goToGame(code);
    }
  });
}

function cleanupRoomSub() {
  if (lobbyState.unsubRoom) {
    try { lobbyState.unsubRoom(); } catch {}
    lobbyState.unsubRoom = null;
  }
}

window.addEventListener('beforeunload', cleanupRoomSub);

// Export opcional si lo requiere algún test
export { enterLobby, createRoom, joinRoom, addAI, startMatch, startGame };
