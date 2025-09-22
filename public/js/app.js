import { ensureSignedIn, createRoom, joinRoom, addAI, startGame, subscribeRoom } from "./lobbyService.js";

const view = document.getElementById("view");

// Estado local mínimo
const state = {
  mode: "home",          // "home" | "create" | "join"
  playerName: "",
  roomCode: "",
  room: null,
  isHost: false,
  loading: false,
  avatars: ["🎯","⚡","🏆","🔥","💎","🚀","🎪","🌟"]
};

const rndAvatar = () => state.avatars[Math.floor(Math.random()*state.avatars.length)];

// Renderiza según estado
function render() {
  if (state.mode === "create") return renderCreate();
  if (state.mode === "join")   return renderJoin();
  return renderHome();
}

function renderHome() {
  view.innerHTML = `
    <div class="card">
      <div class="center">
        <div class="pill mt-2">⚔️ Modo Batalla 1v1</div>
        <h1 class="mt-4">Desafía a un amigo</h1>
        <p class="muted">Todo en tiempo real</p>
      </div>

      <div class="mt-6 grid">
        <input id="name" class="input" placeholder="Ingresa tu nombre de guerrero" value="${escapeHtml(state.playerName)}" />
        <div class="grid cols-2">
          <button id="btnCreate" class="button primary">👑 Crear Sala</button>
          <div>
            <input id="code" class="input" placeholder="Código de sala" value="${escapeHtml(state.roomCode)}" />
            <button id="btnJoin" class="button secondary mt-2">👥 Unirse a Batalla</button>
          </div>
        </div>
      </div>

      <div class="card mt-8">
        <h2>⚡ Reglas de Combate</h2>
        <div class="grid cols-2 mt-4">
          ${regla("📝","5 preguntas por ronda","Batalla intensa garantizada")}
          ${regla("⏰","30 segundos por pregunta","Piensa rápido o pierde")}
          ${regla("🎯","+1 punto por acierto","Cada respuesta cuenta")}
          ${regla("⚡","El más rápido gana empates","Velocidad es clave")}
        </div>
      </div>
    </div>
  `;

  // Wire events
  document.getElementById("name").addEventListener("input", (e)=> state.playerName = e.target.value);
  document.getElementById("code").addEventListener("input", (e)=> state.roomCode = e.target.value.toUpperCase());
  document.getElementById("btnCreate").addEventListener("click", onCreate);
  document.getElementById("btnJoin").addEventListener("click", onJoin);
}

function renderCreate() {
  const players = (state.room?.players)||[];
  view.innerHTML = `
    <div class="card">
      <div class="center">
        <h1>Sala de Batalla</h1>
        <p class="muted mt-2">Código de sala</p>
        <div class="pill mt-2" aria-live="polite">${escapeHtml(state.roomCode)}</div>
      </div>

      <h2 class="mt-6 center">Jugadores Conectados</h2>
      <div class="grid mt-4">
        ${players.map(p => playerCard(p)).join("")}
      </div>

      ${players.length === 1 && state.isHost ? `
        <div class="card mt-6 center">
          <p class="muted">Esperando al segundo jugador...</p>
          <button id="btnAI" class="button secondary mt-4">🤖 Jugar vs IA Avanzada</button>
        </div>` : ``}

      ${players.length === 2 && state.isHost ? `
        <button id="btnStart" class="button accent mt-6">🎯 ¡Comenzar Batalla!</button>` : ``}
    </div>
  `;

  // Wire
  const ai = document.getElementById("btnAI");
  if (ai) ai.addEventListener("click", onAddAI);

  const start = document.getElementById("btnStart");
  if (start) start.addEventListener("click", onStartGame);
}

function renderJoin() {
  const players = (state.room?.players)||[];
  view.innerHTML = `
    <div class="card">
      <div class="center">
        <h1>¡Conectado!</h1>
        <p class="muted mt-2">Sala</p>
        <div class="pill mt-2">${escapeHtml(state.roomCode)}</div>
      </div>

      <div class="grid mt-6">
        ${players.map(p => playerCard(p)).join("")}
      </div>

      <div class="card mt-6 center">
        <p class="muted">Esperando que el anfitrión inicie la partida...</p>
        <div class="pill mt-2">⏳</div>
      </div>
    </div>
  `;
}

function playerCard(p) {
  const role = p.role === "host" ? "Anfitrión" : (p.role === "ai" ? "IA" : "Invitado");
  return `
    <div class="card">
      <div class="row">
        <div class="player">
          <div class="avatar">${p.avatar}</div>
          <div>
            <strong>${escapeHtml(p.name)}</strong><br/>
            <small class="muted">${role}</small>
          </div>
        </div>
        <div class="row" style="gap:8px;">
          ${p.role==="host" ? `<span class="pill">👑</span>` : ``}
          <span class="dot ${p.isReady ? "ok":""}"></span>
        </div>
      </div>
    </div>
  `;
}

function regla(icon,t,s) {
  return `
    <div class="row">
      <div class="pill" aria-hidden="true">${icon}</div>
      <div>
        <strong>${t}</strong><br/><small class="muted">${s}</small>
      </div>
    </div>
  `;
}

// === Handlers ===

let unsub = null;

async function onCreate() {
  if (!state.playerName.trim()) return alert("Escribe tu nombre");
  try {
    state.loading = true;
    await ensureSignedIn();
    const { roomCode } = await createRoom(state.playerName.trim(), rndAvatar());
    state.roomCode = roomCode;
    state.mode = "create";

    // Suscribirse a la sala
    if (unsub) unsub();
    unsub = subscribeRoom(state.roomCode, (data) => {
      state.room = data || null;
      checkHost();
      if (state.room?.status === "in_progress") goToGame();
      render();
    });

    render();
  } catch (e) {
    console.error(e); alert(e.message || "Error al crear sala");
  } finally {
    state.loading = false;
  }
}

async function onJoin() {
  if (!state.playerName.trim() || !state.roomCode.trim()) {
    return alert("Completa nombre y código.");
  }
  try {
    state.loading = true;
    await ensureSignedIn();
    await joinRoom(state.roomCode, state.playerName.trim(), rndAvatar());
    state.mode = "join";

    if (unsub) unsub();
    unsub = subscribeRoom(state.roomCode, (data) => {
      state.room = data || null;
      checkHost();
      if (state.room?.status === "in_progress") goToGame();
      render();
    });

    render();
  } catch (e) {
    console.error(e); alert(e.message || "No se pudo unir a la sala");
  } finally {
    state.loading = false;
  }
}

async function onAddAI() {
  try {
    await addAI(state.roomCode);
  } catch (e) {
    console.error(e); alert(e.message || "No se pudo agregar IA");
  }
}

async function onStartGame() {
  try {
    await startGame(state.roomCode);
    // El snapshot nos llevará a game.html en goToGame()
  } catch (e) {
    console.error(e); alert(e.message || "No se pudo iniciar la partida");
  }
}

async function checkHost() {
  // Determina si el usuario actual es el host
  const user = await ensureSignedIn();
  state.isHost = state.room?.createdBy === user.uid;
}

function goToGame() {
  const names = (state.room?.players||[]).map(p => p.name).join(", ");
  // Lleva datos por querystring (puedes usar sessionStorage si prefieres)
  location.href = `./game.html?code=${encodeURIComponent(state.roomCode)}&players=${encodeURIComponent(names)}`;
}

// Helper para escapar HTML
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

// Inicial
render();
