// ui/renderHome.js
// Pantalla inicial crear/unir.

import { createRoom, joinRoom } from '../services/lobbyService.js';

export function renderHome(root, { onEnterLobby }) {
  root.innerHTML = `
    <div class="card">
      <h1>👑 Royal Trivia</h1>
      <p class="muted mt-2">Crea una sala o únete con un código.</p>

      <div class="grid cols-2 mt-6">
        <form id="createForm" class="grid">
          <h2>Crear sala</h2>
          <input id="playerName" class="input" placeholder="Tu nombre" required />
          <button class="button primary" type="submit">Crear</button>
        </form>

        <form id="joinForm" class="grid">
          <h2>Unirse a sala</h2>
          <input id="roomCode"  class="input" placeholder="Código de sala" required />
          <input id="guestName" class="input" placeholder="Tu nombre" required />
          <button class="button secondary" type="submit">Unirse</button>
        </form>
      </div>

      <div id="lobbyPanel" class="mt-8"></div>
    </div>
  `;

  const createForm = document.getElementById('createForm');
  const joinForm = document.getElementById('joinForm');

  if (createForm) {
    createForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('playerName').value.trim();
      const { roomCode } = await createRoom(name);
      onEnterLobby(roomCode);
    });
  }

  if (joinForm) {
    joinForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const code = document.getElementById('roomCode').value.trim().toUpperCase();
      const name = document.getElementById('guestName').value.trim();
      await joinRoom(code, name);
      onEnterLobby(code);
    });
  }
}
