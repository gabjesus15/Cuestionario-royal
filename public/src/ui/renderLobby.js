// ui/renderLobby.js
// Render del lobby + handlers (copiar código, agregar IA, start).

import { addAI, startMatch, startGame } from '../services/lobbyService.js';
import { escapeHtml } from '../utils/escapeHtml.js';
import { goToGame } from '../utils/navigation.js';
import { DEFAULT_QUESTIONS, toSealedQuestions } from '../logic/questions.js';

export function renderLobby(container, state) {
  const room = state.room;
  const players = room.players ? Object.values(room.players) : [];
  const humans  = players.filter(p => p.role !== 'ai');
  const hasAI   = players.some(p => p.role === 'ai');

  const canStart = state.isHost && humans.length >= 2;
  const canAddAI = state.isHost && humans.length < 2 && !hasAI;

  container.innerHTML = `
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

      <div class="row mt-4" style="align-items:center; gap:12px; flex-wrap:wrap;">
        <button id="copyCodeBtn" class="button">📋 Copiar código</button>

        <button id="addAIBtn" class="button" style="display:${canAddAI ? 'inline-flex' : 'none'}">🤖 Agregar IA</button>

        <!-- Selector de duración global -->
        <label class="pill" for="durationSelect" style="display:${state.isHost ? 'inline-block' : 'none'}">
          ⏱️ Duración por pregunta:&nbsp;
          <select id="durationSelect" class="input" style="height:36px; width:auto; padding:0 10px;">
            <option value="10000">10s</option>
            <option value="15000" selected>15s</option>
            <option value="30000">30s</option>
            <option value="45000">45s</option>
          </select>
        </label>

        <button id="startGameBtn" class="button accent" style="display:${canStart ? 'inline-flex':'none'}">🚀 ¡Comenzar!</button>
      </div>
    </div>
  `;

  const copyBtn  = document.getElementById('copyCodeBtn');
  const startBtn = document.getElementById('startGameBtn');
  const addBtn   = document.getElementById('addAIBtn');
  const durationSelect = document.getElementById('durationSelect');

  if (copyBtn) {
    copyBtn.onclick = async () => {
      try {
        await navigator.clipboard.writeText(room.code);
        copyBtn.textContent = '✅ Copiado';
        setTimeout(() => (copyBtn.textContent = '📋 Copiar código'), 1200);
      } catch { alert('No se pudo copiar'); }
    };
  }

  if (addBtn) {
    addBtn.onclick = async () => {
      await addAI(state.roomCode);
    };
  }

  if (startBtn) {
    startBtn.onclick = async (e) => {
      e?.preventDefault?.();
      if (!state.isHost) return alert('Solo el anfitrión puede iniciar.');
      try {
        const durationMs = Number(durationSelect?.value || 30000);
        await startMatch(state.roomCode, toSealedQuestions(DEFAULT_QUESTIONS), durationMs);
        // El subscribe redirige al ver in_progress
      } catch (err) {
        console.warn('startMatch falló, intentando startGame...', err?.message);
        await startGame(state.roomCode);
        goToGame(state.roomCode);
      }
    };
  }
}

export function renderLobbyGone(container) {
  container.innerHTML = `
    <div class="card center">
      <h2>Sala no disponible</h2>
      <p class="muted">La sala se cerró o ya no está accesible.</p>
    </div>
  `;
}
