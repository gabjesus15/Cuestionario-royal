// services/lobbyService.js
// Igual que tu lobbyService actual; SIN acceso al DOM.

import {
  database, ensureAuthenticated, ref, get, set, update,
  runTransaction, onValue, off, onDisconnect, serverTimestamp
} from './firebaseClient.js';

// Utilidades internas
function normalizeRoomCode(code) {
  return String(code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}
function normalizeName(name) {
  return String(name || '').trim().slice(0, 40);
}
function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

const MAX_HUMANS = 2;

export async function ensureSignedIn() {
  return await ensureAuthenticated();
}

export async function createRoom(playerName, avatar) {
  const name = normalizeName(playerName);
  if (!name) throw new Error('El nombre es requerido.');

  const user = await ensureSignedIn();

  // Genera código único
  let code = generateCode();
  while ((await get(ref(database, `rooms/${code}`))).exists()) {
    code = generateCode();
  }

  const roomRef = ref(database, `rooms/${code}`);
  const now = serverTimestamp();

  const room = {
    code,
    createdBy: user.uid,
    status: 'waiting',
    createdAt: now,
    players: {
      [user.uid]: {
        id: user.uid, name, avatar: avatar || '🚀',
        role: 'host', isReady: true, online: true, joinedAt: now,
      },
    },
  };

  await set(roomRef, room);

  // Presencia
  try {
    const presRef = ref(database, `rooms/${code}/players/${user.uid}/online`);
    await set(presRef, true);
    onDisconnect(presRef).set(false);
  } catch {}

  return { roomCode: code };
}

export async function joinRoom(roomCode, playerName, avatar) {
  const code = normalizeRoomCode(roomCode);
  const name = normalizeName(playerName);
  if (!name) throw new Error('El nombre es requerido.');

  const user = await ensureSignedIn();
  const roomRef = ref(database, `rooms/${code}`);

  const res = await runTransaction(roomRef, (room) => {
    if (!room) return room;
    const players = room.players || {};
    const humanCount = Object.values(players).filter(p => p && p.role !== 'ai').length;
    if (humanCount >= MAX_HUMANS) return;

    players[user.uid] = {
      id: user.uid, name, avatar: avatar || '🎯',
      role: room.createdBy === user.uid ? 'host' : 'guest',
      isReady: true, online: true, joinedAt: serverTimestamp(),
    };
    return { ...room, players };
  });

  if (!res.committed) {
    const snap = await get(roomRef);
    if (!snap.exists()) throw new Error('Sala no existe.');
    throw new Error('Sala llena.');
  }

  try {
    const presRef = ref(database, `rooms/${code}/players/${user.uid}/online`);
    await set(presRef, true);
    onDisconnect(presRef).set(false);
  } catch {}

  return { ok: true };
}

export async function addAI(roomCode) {
  const code = normalizeRoomCode(roomCode);
  const roomRef = ref(database, `rooms/${code}`);

  const res = await runTransaction(roomRef, (room) => {
    if (!room) return room;
    const players = room.players || {};
    const humanCount = Object.values(players).filter(p => p && p.role !== 'ai').length;
    const hasAI = Object.values(players).some(p => p && p.role === 'ai');

    if (humanCount >= MAX_HUMANS) return;
    if (hasAI) return room;

    players['ai'] = {
      id: 'ai', name: 'IA Avanzada', avatar: '🤖',
      role: 'ai', isReady: true, online: true, joinedAt: serverTimestamp(),
    };
    return { ...room, players };
  });

  if (!res.committed) {
    const snap = await get(roomRef);
    if (!snap.exists()) throw new Error('Sala no existe.');
    throw new Error('Sala llena o IA ya agregada.');
  }
  return { ok: true };
}

/** Compat: marcar sala in_progress sin sellar preguntas. */
export async function startGame(roomCode) {
  const code = normalizeRoomCode(roomCode);
  const roomSnap = await get(ref(database, `rooms/${code}`));
  if (!roomSnap.exists()) throw new Error('Sala no existe.');

  await update(ref(database, `rooms/${code}`), {
    status: 'in_progress',
    startedAt: serverTimestamp(),
  });
  return { ok: true };
}

/** Inicializa games/{code} con preguntas selladas. */
export async function startMatch(roomCode, sealedQuestions = [], durationMs = 30000) {
  const code = normalizeRoomCode(roomCode);
  const roomRef = ref(database, `rooms/${code}`);
  const roomSnap = await get(roomRef);
  if (!roomSnap.exists()) throw new Error('Sala no existe.');

  const room = roomSnap.val();
  const players = room.players || {};
  const scores = {};
  Object.values(players).forEach(p => { if (p?.id) scores[p.id] = 0; });

  if (!Array.isArray(sealedQuestions) || sealedQuestions.length === 0) {
    throw new Error('No se proporcionaron preguntas para la partida.');
  }

  await update(roomRef, { status: 'in_progress', startedAt: serverTimestamp() });

  const gameRef = ref(database, `games/${code}`);
  await set(gameRef, {
    phase: 'question',
    currentIndex: 0,
    questionStartAt: serverTimestamp(),
    questionDurationMs: durationMs,
    questions: sealedQuestions,
    answers: {},
    scores,
    startedAt: serverTimestamp(),
  });

  return { ok: true };
}

export function subscribeRoom(roomCode, cb) {
  const code = normalizeRoomCode(roomCode);
  const roomRef = ref(database, `rooms/${code}`);

  const handler = onValue(roomRef, (snapshot) => {
    if (snapshot.exists()) cb(snapshot.val());
    else cb(null);
  }, (error) => {
    console.error('Error in subscribeRoom:', error);
    cb(null);
  });

  return () => off(roomRef, 'value', handler);
}

export async function getRoomOnce(roomCode) {
  const code = normalizeRoomCode(roomCode);
  const snapshot = await get(ref(database, `rooms/${code}`));
  if (!snapshot.exists()) return null;
  return snapshot.val();
}
