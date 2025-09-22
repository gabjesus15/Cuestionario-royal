// app.js — Lobby SPA con botón "Agregar IA" y renderHome minimalista (versión anterior)
import {
  ensureSignedIn,
  createRoom,
  joinRoom,
  startMatch,
  startGame,
  subscribeRoom,
  getRoomOnce,
  addAI,                // 👈 usamos la IA del lobbyService (ya implementada)
} from './lobbyService.js';
import { ensureAuthenticated } from './firebase.js';

const state = {
  currentUser: null,
  roomCode: null,
  room: null,
  unsubRoom: null,
  isHost: false,
};

// Mismo set que en game.js para fallback/legacy
const DEFAULT_QUESTIONS = [
  { questionIndex: 0, category: "Geografía",  text: "¿Cuál es la capital de Francia?", options: ["Londres","París","Madrid","Roma"], correctIndex: 1 },
  { questionIndex: 1, category: "Historia",   text: "¿En qué año llegó el hombre a la Luna?", options: ["1967","1969","1971","1973"], correctIndex: 1 },
  { questionIndex: 2, category: "Ciencia",    text: "¿Cuál es el planeta más grande del sistema solar?", options: ["Saturno","Neptuno","Júpiter","Urano"], correctIndex: 2 },
  { questionIndex: 3, category: "Literatura", text: "¿Quién escribió 'Don Quijote de la Mancha'?", options: ["Lope de Vega","Miguel de Cervantes","Federico García Lorca","Calderón de la Barca"], correctIndex: 1 },
  { questionIndex: 4, category: "Geografía",  text: "¿Cuál es el océano más grande del mundo?", options: ["Atlántico","Índico","Ártico","Pacífico"], correctIndex: 3 },
];

document.addEventListener('DOMContentLoaded', init);

async function init() {
  try {
    state.currentUser = await ensureAuthenticated();
  } catch (e) {
    console.error('No se pudo autenticar:', e);
    alert('Error de autenticación');
    return;
  }

  hydrateFromQuery();
  renderHome();

  if (state.roomCode) {
    await enterLobby(state.roomCode);
  }
}

// ---------- Render raíz (versión anterior, minimalista) ----------
function renderHome() {
  const view = document.getElementById('view');
  if (!view) return;

  view.innerHTML = `
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

  wireHomeHandlers();
}

// ---------- Enlaces UI de home ----------
function wireHomeHandlers() {
  const createForm = document.getElementById('createForm');
  const joinForm   = document.getElementById('joinForm');

  if (createForm) {
    createForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('playerName').value.trim();
      try {
        // Avatar por defecto lo pone lobbyService si no se pasa
        const { roomCode } = await createRoom(name);
        await enterLobby(roomCode);
      } catch (err) {
        console.error(err);
        alert(err.message || 'No se pudo crear la sala');
      }
    });
  }

  if (joinForm) {
    joinForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const code = document.getElementById('roomCode').value.trim().toUpperCase();
      const name = document.getElementById('guestName').value.trim();
      try {
        // Avatar por defecto lo pone lobbyService si no se pasa
        await joinRoom(code, name);
        await enterLobby(code);
      } catch (err) {
        console.error(err);
        alert(err.message || 'No se pudo unir a la sala');
      }
    });
  }
}

// ---------- Lobby ----------
async function enterLobby(code) {
  cleanupRoomSub();

  state.roomCode = code;
  const room = await getRoomOnce(code);
  if (!room) {
    alert('La sala no existe o ha expirado');
    return;
  }
  state.room = room;
  state.isHost = room.createdBy === state.currentUser?.uid;

  renderLobby(room);

  state.unsubRoom = subscribeRoom(code, (next) => {
    if (!next) {
      console.warn('Sala eliminada');
      renderLobbyGone();
      return;
    }
    state.room = next;
    state.isHost = next.createdBy === state.currentUser?.uid;
    renderLobby(next);

    if (next.status === 'in_progress') {
      goToGame(code);
    }
  });
}

function renderLobby(room) {
  const panel = document.getElementById('lobbyPanel');
  if (!panel) return;

  const players = room.players ? Object.values(room.players) : [];
  const humans  = players.filter(p => p.role !== 'ai');
  const hasAI   = players.some(p => p.role === 'ai');

  const canStart = state.isHost && humans.length >= 2;
  const canAddAI = state.isHost && humans.length < 2 && !hasAI;

  panel.innerHTML = `
    <div class="card">
      <div class="row">
        <div class="pill">Sala: <strong>${escapeHtml(room.code)}</strong></div>
        <div class="pill">Estado: <strong>${escapeHtml(room.status)}</strong></div>
      </div>

      <div class="players-info">
        ${players.map(p => `
          <div class="player-card">
            <span class="avatar">${p.avatar || '🙂'}</span>
            <strong>${escapeHtml(p.name || 'Jugador')}</strong>
            ${p.role === 'host' ? '<small style="color:#fbbf24">👑 Anfitrión</small>' : ''}
            ${p.online === false ? '<small class="muted">(offline)</small>' : ''}
            ${p.role === 'ai' ? '<small class="muted">🤖 IA</small>' : ''}
          </div>
        `).join('')}
      </div>

      <div class="row mt-4">
        <button id="copyCodeBtn" class="button">📋 Copiar código</button>
        <button id="addAIBtn" class="button" style="display:${canAddAI ? 'inline-flex' : 'none'}">🤖 Agregar IA</button>
        <button id="startGameBtn" class="button accent" style="display:${canStart ? 'inline-flex':'none'}">🚀 ¡Comenzar!</button>
      </div>
    </div>
  `;

  const copyBtn  = document.getElementById('copyCodeBtn');
  const startBtn = document.getElementById('startGameBtn');
  const addBtn   = document.getElementById('addAIBtn');

  if (copyBtn) {
    copyBtn.onclick = async () => {
      try {
        await navigator.clipboard.writeText(room.code);
        copyBtn.textContent = '✅ Copiado';
        setTimeout(() => (copyBtn.textContent = '📋 Copiar código'), 1200);
      } catch {
        alert('No se pudo copiar');
      }
    };
  }

  if (addBtn) {
    addBtn.onclick = async () => {
      try {
        await addAI(state.roomCode);
      } catch (err) {
        console.error(err);
        alert(err.message || 'No se pudo agregar la IA');
      }
    };
  }

  if (startBtn) {
    startBtn.onclick = onStartClicked;
  }
}

function renderLobbyGone() {
  const panel = document.getElementById('lobbyPanel');
  if (!panel) return;
  panel.innerHTML = `
    <div class="card center">
      <h2>Sala no disponible</h2>
      <p class="muted">La sala se cerró o ya no está accesible.</p>
    </div>
  `;
}

async function onStartClicked(e) {
  e?.preventDefault?.();
  if (!state.isHost) return alert('Solo el anfitrión puede iniciar.');

  try {
    await startMatch(state.roomCode, DEFAULT_QUESTIONS, 30000);
    // subscribeRoom redirigirá cuando vea in_progress
  } catch (err) {
    console.warn('startMatch falló, intentando startGame...', err?.message);
    try {
      await startGame(state.roomCode);
      goToGame(state.roomCode); // por si el subscribe tarda
    } catch (err2) {
      console.error(err2);
      alert('No se pudo iniciar: ' + (err2?.message || 'error desconocido'));
    }
  }
}

// ---------- Navegación ----------
function goToGame(code) {
  window.location.href = `./game.html?code=${encodeURIComponent(code)}`;
}

// ---------- Utilidades ----------
function hydrateFromQuery() {
  const params = new URLSearchParams(location.search);
  const code = params.get('code');
  if (code) state.roomCode = code.trim().toUpperCase();
}

function cleanupRoomSub() {
  if (state.unsubRoom) {
    try { state.unsubRoom(); } catch {}
    state.unsubRoom = null;
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = String(text ?? '');
  return div.innerHTML;
}

window.addEventListener('beforeunload', cleanupRoomSub);
