// Lobby service robusto para salas y presencia en Firebase Realtime Database
// - Códigos únicos y normalizados
// - Capacidad de sala (2 humanos máx.) + IA opcional
// - Presencia con onDisconnect (marca online=false al salir)
// - StartMatch: inicializa games/{code} de forma completa (fase, preguntas selladas, scores)
// - Suscripciones con limpieza

import {
  database,
  ensureAuthenticated,
  ref,
  get,
  set,
  update,
  runTransaction,
  onValue,
  off,
  onDisconnect,
  serverTimestamp,
} from './firebase.js';

// ---------- Utilidades ----------
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

const MAX_HUMANS = 2; // host + 1 invitado

export async function ensureSignedIn() {
  return await ensureAuthenticated();
}

// ---------- Crear sala ----------
export async function createRoom(playerName, avatar) {
  const name = normalizeName(playerName);
  if (!name) throw new Error('El nombre es requerido.');

  const user = await ensureSignedIn();

  // Generar código único
  let code = generateCode();
  while ((await get(ref(database, `rooms/${code}`))).exists()) {
    code = generateCode();
  }

  const roomRef = ref(database, `rooms/${code}`);
  const now = serverTimestamp();

  const room = {
    code,
    createdBy: user.uid,
    status: 'waiting', // waiting | in_progress | finished
    createdAt: now,
    players: {
      [user.uid]: {
        id: user.uid,
        name,
        avatar: avatar || '🚀',
        role: 'host',
        isReady: true,
        online: true,
        joinedAt: now,
      },
    },
  };

  await set(roomRef, room);

  // Presencia: si el host se va, marcar offline
  try {
    const presRef = ref(database, `rooms/${code}/players/${user.uid}/online`);
    await set(presRef, true);
    onDisconnect(presRef).set(false);
  } catch {
    // en entornos sin onDisconnect, ignorar
  }

  return { roomCode: code };
}

// ---------- Unirse a sala ----------
export async function joinRoom(roomCode, playerName, avatar) {
  const code = normalizeRoomCode(roomCode);
  const name = normalizeName(playerName);
  if (!name) throw new Error('El nombre es requerido.');

  const user = await ensureSignedIn();
  const roomRef = ref(database, `rooms/${code}`);

  // Usar transacción para no sobrepasar capacidad por condiciones de carrera
  const res = await runTransaction(roomRef, (room) => {
    if (!room) {
      return room; // abortará
    }
    const players = room.players || {};
    const humanCount = Object.values(players).filter(p => p && p.role !== 'ai').length;

    if (humanCount >= MAX_HUMANS) {
      return; // abort -> exceso de capacidad
    }

    players[user.uid] = {
      id: user.uid,
      name,
      avatar: avatar || '🎯',
      role: room.createdBy === user.uid ? 'host' : 'guest',
      isReady: true,
      online: true,
      joinedAt: serverTimestamp(),
    };

    return {
      ...room,
      players,
    };
  });

  if (!res.committed) {
    const snap = await get(roomRef);
    if (!snap.exists()) throw new Error('Sala no existe.');
    throw new Error('Sala llena.');
  }

  // Presencia del invitado
  try {
    const presRef = ref(database, `rooms/${code}/players/${user.uid}/online`);
    await set(presRef, true);
    onDisconnect(presRef).set(false);
  } catch {
    // sin soporte de onDisconnect
  }

  return { ok: true };
}

// ---------- Agregar IA ----------
export async function addAI(roomCode) {
  const code = normalizeRoomCode(roomCode);
  const roomRef = ref(database, `rooms/${code}`);

  const res = await runTransaction(roomRef, (room) => {
    if (!room) return room;
    const players = room.players || {};

    const humanCount = Object.values(players).filter(p => p && p.role !== 'ai').length;
    const hasAI = Object.values(players).some(p => p && p.role === 'ai');

    if (humanCount >= MAX_HUMANS) return; // lleno de humanos
    if (hasAI) return room; // ya hay IA

    players['ai'] = {
      id: 'ai',
      name: 'IA Avanzada',
      avatar: '🤖',
      role: 'ai',
      isReady: true,
      online: true,
      joinedAt: serverTimestamp(),
    };

    return {
      ...room,
      players,
    };
  });

  if (!res.committed) {
    const snap = await get(roomRef);
    if (!snap.exists()) throw new Error('Sala no existe.');
    throw new Error('Sala llena o IA ya agregada.');
  }

  return { ok: true };
}

// ---------- Marcar sala in_progress (compatibilidad) ----------
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

// ---------- Inicializar partida completa (recomendado) ----------
/**
 * Sella e inicializa games/{code} con preguntas, fase y puntuaciones.
 * Úsalo desde el lobby cuando el host pulse "Comenzar".
 * @param {string} roomCode
 * @param {Array} sealedQuestions - [{questionIndex, category, text, options, correctIndex}]
 * @param {number} durationMs - duración por pregunta en ms (default 30000)
 */
export async function startMatch(roomCode, sealedQuestions = [], durationMs = 30000) {
  const code = normalizeRoomCode(roomCode);
  const roomRef = ref(database, `rooms/${code}`);
  const roomSnap = await get(roomRef);
  if (!roomSnap.exists()) throw new Error('Sala no existe.');

  const room = roomSnap.val();
  const players = room.players || {};
  const scores = {};
  Object.values(players).forEach(p => {
    if (p?.id) scores[p.id] = 0;
  });

  // Si no pasaron preguntas selladas, abortar (o podríamos generarlas aquí)
  if (!Array.isArray(sealedQuestions) || sealedQuestions.length === 0) {
    throw new Error('No se proporcionaron preguntas para la partida.');
  }

  // Marcar sala en progreso
  await update(roomRef, {
    status: 'in_progress',
    startedAt: serverTimestamp(),
  });

  // Crear nodo de game autoritativo
  const gameRef = ref(database, `games/${code}`);
  await set(gameRef, {
    phase: 'question',
    currentIndex: 0,
    questionStartAt: serverTimestamp(),
    questionDurationMs: durationMs,
    questions: sealedQuestions,
    answers: {}, // answers[qIndex][uid] = { answer, ts }
    scores,
    startedAt: serverTimestamp(),
  });

  return { ok: true };
}

// ---------- Suscripción a sala (con limpieza) ----------
export function subscribeRoom(roomCode, cb) {
  const code = normalizeRoomCode(roomCode);
  const roomRef = ref(database, `rooms/${code}`);

  const handler = onValue(
    roomRef,
    (snapshot) => {
      if (snapshot.exists()) {
        const room = snapshot.val();
        // No convertir a array por defecto; dejamos players como objeto (más robusto)
        // Si necesitas array en la UI, que la UI haga Object.values(room.players)
        cb(room);
      } else {
        cb(null);
      }
    },
    (error) => {
      console.error('Error in subscribeRoom:', error);
      cb(null);
    }
  );

  // Devolver función de limpieza que usa off()
  return () => off(roomRef, 'value', handler);
}

// ---------- Lectura puntual ----------
export async function getRoomOnce(roomCode) {
  const code = normalizeRoomCode(roomCode);
  const roomRef = ref(database, `rooms/${code}`);
  const snapshot = await get(roomRef);
  if (!snapshot.exists()) return null;
  return snapshot.val();
}
