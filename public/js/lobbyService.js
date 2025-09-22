// Implementación con Firebase Realtime Database
import { database, ensureAuthenticated, ref, set, get, onValue, serverTimestamp } from './firebase.js';

function normalizeRoomCode(code) {
  return String(code || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}

function normalizeName(name) {
  return String(name || "").trim().slice(0, 40);
}

function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export async function ensureSignedIn() {
  return await ensureAuthenticated();
}

export async function createRoom(playerName, avatar) {
  const name = normalizeName(playerName);
  if (!name) throw new Error("El nombre es requerido.");
  
  const user = await ensureSignedIn();
  let code = generateCode();
  
  // Verificar que el código no exista
  let exists = true;
  while (exists) {
    const roomRef = ref(database, `rooms/${code}`);
    const snapshot = await get(roomRef);
    exists = snapshot.exists();
    if (exists) code = generateCode();
  }
  
  const room = {
    code,
    createdBy: user.uid,
    status: "waiting",
    createdAt: serverTimestamp(),
    players: {
      [user.uid]: {
        id: user.uid,
        name,
        avatar: avatar || "🚀",
        role: "host",
        isReady: true,
        joinedAt: serverTimestamp()
      }
    }
  };
  
  const roomRef = ref(database, `rooms/${code}`);
  await set(roomRef, room);
  
  return { roomCode: code };
}

export async function joinRoom(roomCode, playerName, avatar) {
  const code = normalizeRoomCode(roomCode);
  const name = normalizeName(playerName);
  if (!name) throw new Error("El nombre es requerido.");
  
  const user = await ensureSignedIn();
  const roomRef = ref(database, `rooms/${code}`);
  const snapshot = await get(roomRef);
  
  if (!snapshot.exists()) {
    throw new Error("Sala no existe.");
  }
  
  const room = snapshot.val();
  const playerCount = Object.keys(room.players || {}).length;
  
  if (playerCount >= 2) {
    throw new Error("Sala llena.");
  }
  
  // Agregar jugador a la sala
  const playerRef = ref(database, `rooms/${code}/players/${user.uid}`);
  await set(playerRef, {
    id: user.uid,
    name,
    avatar: avatar || "🎯",
    role: "guest",
    isReady: true,
    joinedAt: serverTimestamp()
  });
  
  return { ok: true };
}

export async function addAI(roomCode) {
  const code = normalizeRoomCode(roomCode);
  const roomRef = ref(database, `rooms/${code}`);
  const snapshot = await get(roomRef);
  
  if (!snapshot.exists()) {
    throw new Error("Sala no existe.");
  }
  
  const room = snapshot.val();
  const playerCount = Object.keys(room.players || {}).length;
  
  if (playerCount >= 2) {
    throw new Error("Sala llena.");
  }
  
  // Agregar IA a la sala
  const aiRef = ref(database, `rooms/${code}/players/ai`);
  await set(aiRef, {
    id: "ai",
    name: "IA Avanzada",
    avatar: "🤖",
    role: "ai",
    isReady: true,
    joinedAt: serverTimestamp()
  });
  
  return { ok: true };
}

export async function startGame(roomCode) {
  const code = normalizeRoomCode(roomCode);
  const roomRef = ref(database, `rooms/${code}`);
  const snapshot = await get(roomRef);
  
  if (!snapshot.exists()) {
    throw new Error("Sala no existe.");
  }
  
  // Actualizar status de la sala
  const statusRef = ref(database, `rooms/${code}/status`);
  await set(statusRef, "in_progress");
  
  // Agregar timestamp de inicio
  const startedAtRef = ref(database, `rooms/${code}/startedAt`);
  await set(startedAtRef, serverTimestamp());
  
  return { ok: true };
}

export function subscribeRoom(roomCode, cb) {
  const code = normalizeRoomCode(roomCode);
  const roomRef = ref(database, `rooms/${code}`);
  
  const unsubscribe = onValue(roomRef, (snapshot) => {
    if (snapshot.exists()) {
      const room = snapshot.val();
      // Convertir players object a array para compatibilidad con el código existente
      if (room.players) {
        room.players = Object.values(room.players);
      }
      cb(room);
    } else {
      cb(null);
    }
  }, (error) => {
    console.error("Error in subscribeRoom:", error);
    cb(null);
  });
  
  return unsubscribe;
}

export async function getRoomOnce(roomCode) {
  const code = normalizeRoomCode(roomCode);
  const roomRef = ref(database, `rooms/${code}`);
  const snapshot = await get(roomRef);
  
  if (snapshot.exists()) {
    const room = snapshot.val();
    // Convertir players object a array para compatibilidad
    if (room.players) {
      room.players = Object.values(room.players);
    }
    return room;
  }
  
  return null;
}

