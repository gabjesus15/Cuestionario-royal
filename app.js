// Estado del lobby (sin React)
const state = {
  gameMode: null, // 'create' | 'join' | null
  players: [],
  playerName: '',
  roomCode: '',
  isHost: false,
  avatars: ['🎯','⚡','🏆','🔥','💎','🚀','🎪','🌟'],
};

const $app = document.getElementById('app');

// Helpers
const rnd = (n) => Math.floor(Math.random() * n);
const pick = (arr) => arr[rnd(arr.length)];
const genRoom = (len = 6) => [...crypto.getRandomValues(new Uint8Array(len))]
  .map(v => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[v % 36]).join('');

function setState(patch) {
  Object.assign(state, patch);
  render();
}

function createRoom() {
  const name = state.playerName.trim();
  if (!name) return;
  const code = genRoom();

  const host = {
    id: '1',
    name,
    avatar: pick(state.avatars),
    isReady: true,
  };

  setState({
    roomCode: code,
    players: [host],
    isHost: true,
    gameMode: 'create',
  });
}

function joinRoom() {
  const name = state.playerName.trim();
  const code = state.roomCode.trim().toUpperCase();
  if (!name || !code) return;

  const host = {
    id: '1',
    name: 'Oponente',
    avatar: pick(state.avatars),
    isReady: true,
  };
  const p2 = {
    id: '2',
    name,
    avatar: pick(state.avatars),
    isReady: true,
  };

  setState({
    roomCode: code,
    players: [host, p2],
    isHost: false,
    gameMode: 'join',
  });
}

function addAIPlayer() {
  if (state.players.length >= 2) return;
  const ai = { id:'2', name:'Cerebro IA', avatar:'🤖', isReady:true };
  setState({ players: [...state.players, ai] });
}

function startGame() {
  if (state.players.length === 2 && state.players.every(p => p.isReady)) {
    if (typeof window.onStartGame === 'function') {
      window.onStartGame(state.players);
    } else {
      alert('Implementa window.onStartGame(players)');
    }
  }
}

function input(name, value) { setState({ [name]: value }); }

// Render
function render() {
  const { gameMode } = state;
  let html = '';

  if (gameMode === 'create') {
    html = renderCreate();
  } else if (gameMode === 'join') {
    html = renderJoin();
  } else {
    html = renderInitial();
  }

  $app.innerHTML = `
    <div class="container">
      <div class="glass">
        ${html}
      </div>
    </div>
  `;

  // Bindings comunes
  const get = (sel) => $app.querySelector(sel);

  // Inputs
  const nameInput = get('#playerName');
  if (nameInput) nameInput.addEventListener('input', e => input('playerName', e.target.value));

  const roomInput = get('#roomCode');
  if (roomInput) roomInput.addEventListener('input', e => input('roomCode', e.target.value.toUpperCase()));

  // Botones
  const bCreate = get('#btnCreate');
  if (bCreate) bCreate.addEventListener('click', createRoom);

  const bJoin = get('#btnJoin');
  if (bJoin) bJoin.addEventListener('click', joinRoom);

  const bAddAI = get('#btnAddAI');
  if (bAddAI) bAddAI.addEventListener('click', addAIPlayer);

  const bStart = get('#btnStart');
  if (bStart) bStart.addEventListener('click', startGame);
}

// Vistas
function renderHeader({ emoji = '🎮', title = '', subtitle = '' }) {
  return `
    <div class="center" style="margin-bottom:20px">
      <div class="logoSquare" style="background:linear-gradient(135deg,#a855f7,#4f46e5)">${emoji}</div>
      <div class="titleGrad" style="margin-top:16px">${title}</div>
      ${subtitle ? `<div class="subtitle center" style="margin-top:6px">${subtitle}</div>` : ''}
    </div>
  `;
}

function playerTile(p, role, showCrown) {
  return `
    <div class="card" style="margin-bottom:12px">
      <div class="row between">
        <div class="row">
          <div class="avatarBox">${p.avatar}</div>
          <div>
            <div style="font-weight:800">${p.name}</div>
            <div style="opacity:.65;font-size:.8rem;font-weight:600;letter-spacing:.6px">${role.toUpperCase()}</div>
          </div>
        </div>
        <div class="row">
          ${showCrown ? `
            <div style="width:28px;height:28px;border-radius:999px;display:grid;place-items:center;background:linear-gradient(135deg,#f59e0b,#ea580c);margin-right:8px">
              <span style="font-size:16px">👑</span>
            </div>` : ''}
          <div class="dot ${p.isReady ? 'ready' : ''}"></div>
        </div>
      </div>
    </div>
  `;
}

function rulesBlock() {
  return `
    <div class="card" style="border:1px solid rgba(245,158,11,.35);margin-top:10px">
      <div class="titleGrad" style="background:linear-gradient(90deg,#f59e0b,#ea580c);-webkit-background-clip:text;background-clip:text;color:transparent;margin-bottom:10px">
        ⚡ Reglas de Combate
      </div>
      <div class="grid cols-2">
        ${ruleRow('📝','5 preguntas por ronda','Batalla intensa garantizada')}
        ${ruleRow('⏰','30 segundos por pregunta','Piensa rápido o pierde')}
        ${ruleRow('🎯','+1 punto por acierto','Cada respuesta cuenta')}
        ${ruleRow('⚡','El más rápido gana empates','Velocidad es clave')}
      </div>
    </div>
  `;
}
function ruleRow(icon, title, sub) {
  return `
    <div class="row">
      <div style="width:48px;height:48px;border-radius:12px;display:grid;place-items:center;background:linear-gradient(135deg,#60a5fa,#4f46e5)">${icon}</div>
      <div>
        <div style="font-weight:800">${title}</div>
        <div style="opacity:.75">${sub}</div>
      </div>
    </div>
  `;
}

function renderInitial() {
  const canCreate = state.playerName.trim().length > 0;
  const canJoin = canCreate && state.roomCode.trim().length > 0;

  return `
    ${renderHeader({ emoji:'⚔️', title:'Modo Batalla 1v1', subtitle:'¡Desafía a un amigo en un duelo de conocimiento épico!' })}
    <div class="stack">
      <input id="playerName" class="input" placeholder="Ingresa tu nombre de guerrero" value="${state.playerName}">
      <div class="grid cols-2">
        <button id="btnCreate" class="btn btn-blue" ${!canCreate ? 'disabled' : ''}>
          👑&nbsp;&nbsp;Crear Sala
        </button>
        <div class="stack">
          <input id="roomCode" class="input" placeholder="Código de sala" value="${state.roomCode}">
          <button id="btnJoin" class="btn btn-green" ${!canJoin ? 'disabled' : ''}>
            👥&nbsp;&nbsp;Unirse a Batalla
          </button>
        </div>
      </div>
      ${rulesBlock()}
    </div>
  `;
}

function renderCreate() {
  const { players, roomCode, isHost } = state;
  const canStart = players.length === 2 && players.every(p => p.isReady);

  return `
    ${renderHeader({
      emoji:'👥',
      title:'Sala de Batalla',
      subtitle: `
        <div class="card" style="text-align:center;border:1px solid rgba(34,211,238,.35)">
          <div style="opacity:.8;margin-bottom:4px">Código de sala</div>
          <div class="titleGrad" style="font-size:28px;letter-spacing:4px">${roomCode}</div>
        </div>`
    })}
    <div class="stack">
      <div class="titleGrad" style="font-size:22px;margin-bottom:6px">Jugadores Conectados</div>
      ${players.map((p, idx)=>playerTile(p, idx===0?'Anfitrión':'Invitado', isHost && idx===0)).join('')}
      ${players.length === 1 ? `
        <div class="card" style="border:2px dashed rgba(255,255,255,.2);text-align:center">
          <div style="opacity:.6;margin-bottom:12px">
            <div class="avatarBox" style="margin:0 auto 10px;opacity:.7;filter:grayscale(30%)">👥</div>
            <div>Esperando al segundo jugador…</div>
          </div>
          <button id="btnAddAI" class="btn btn-green">⚡&nbsp;&nbsp;Jugar vs IA Avanzada</button>
        </div>
      `:''}
      ${canStart ? `
        <button id="btnStart" class="btn btn-primary" style="height:72px">
          🎯&nbsp;&nbsp;<div style="display:inline-block;text-align:left">
            <div style="font-weight:800">¡Comenzar Batalla!</div>
            <div style="opacity:.85;font-size:.9rem">Los guerreros están listos</div>
          </div>
        </button>`:''}
    </div>
  `;
}

function renderJoin() {
  const { players, roomCode } = state;
  return `
    ${renderHeader({
      emoji:'👥',
      title:'¡Conectado!',
      subtitle: `
        <div class="card" style="text-align:center;border:1px solid rgba(34,211,238,.35)">
          <div style="opacity:.8;margin-bottom:4px">Sala</div>
          <div class="titleGrad" style="font-size:22px;letter-spacing:3px">${roomCode}</div>
        </div>`
    })}
    <div class="stack">
      ${players.map((p, idx)=>playerTile(p, idx===0?'Anfitrión':'Tú', idx===0)).join('')}
      <div class="card center" style="border:1px solid rgba(245,158,11,.35)">
        <div style="color:#ffe082;font-weight:700;margin-bottom:10px">Esperando que el anfitrión inicie la partida…</div>
        <div class="pulse">⏳</div>
      </div>
      <button id="btnStart" class="btn btn-primary" style="height:72px">
        🎯&nbsp;&nbsp;<div style="display:inline-block;text-align:left">
          <div style="font-weight:800">¡Comenzar Batalla!</div>
          <div style="opacity:.85;font-size:.9rem">Ambos guerreros listos</div>
        </div>
      </button>
    </div>
  `;
}

// Primera pintura
render();
