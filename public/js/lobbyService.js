// Implementación local en memoria (sin base de datos)

function normalizeRoomCode(code) {
  return String(code || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}
function normalizeName(name) {
  return String(name || "").trim().slice(0, 40);
}

const roomStore = new Map();

function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function getUserId() {
  const key = "royal_local_uid";
  let uid = localStorage.getItem(key);
  if (!uid) {
    uid = Math.random().toString(36).slice(2, 10);
    localStorage.setItem(key, uid);
  }
  return uid;
}

export async function ensureSignedIn() {
  return { uid: getUserId() };
}

export async function createRoom(playerName, avatar) {
  const name = normalizeName(playerName);
  if (!name) throw new Error("El nombre es requerido.");
  let code = generateCode();
  while (roomStore.has(code)) code = generateCode();
  const createdBy = getUserId();
  const room = {
    code,
    createdBy,
    status: "waiting",
    players: [
      { id: createdBy, name, avatar: avatar || "🚀", role: "host", isReady: true }
    ]
  };
  roomStore.set(code, room);
  notify(code);
  return { roomCode: code };
}

export async function joinRoom(roomCode, playerName, avatar) {
  const code = normalizeRoomCode(roomCode);
  const name = normalizeName(playerName);
  const uid = getUserId();
  if (!roomStore.has(code)) throw new Error("Sala no existe.");
  const room = roomStore.get(code);
  if (room.players.length >= 2) throw new Error("Sala llena.");
  if (!name) throw new Error("El nombre es requerido.");
  if (!room.players.find(p => p.id === uid)) {
    room.players.push({ id: uid, name, avatar: avatar || "🎯", role: "guest", isReady: true });
  }
  notify(code);
  return { ok: true };
}

export async function addAI(roomCode) {
  const code = normalizeRoomCode(roomCode);
  const room = roomStore.get(code);
  if (!room) throw new Error("Sala no existe.");
  if (room.players.length >= 2) throw new Error("Sala llena.");
  room.players.push({ id: "ai", name: "IA", avatar: "🤖", role: "ai", isReady: true });
  notify(code);
  return { ok: true };
}

export async function startGame(roomCode) {
  const code = normalizeRoomCode(roomCode);
  const room = roomStore.get(code);
  if (!room) throw new Error("Sala no existe.");
  room.status = "in_progress";
  notify(code);
  return { ok: true };
}

const listeners = new Map();
function notify(code) {
  const lset = listeners.get(code);
  if (!lset) return;
  const room = roomStore.get(code);
  for (const cb of lset) cb(room ? { ...room } : null);
}

export function subscribeRoom(roomCode, cb) {
  const code = normalizeRoomCode(roomCode);
  let lset = listeners.get(code);
  if (!lset) listeners.set(code, (lset = new Set()));
  lset.add(cb);
  cb(roomStore.get(code) ? { ...roomStore.get(code) } : null);
  return () => {
    lset.delete(cb);
    if (lset.size === 0) listeners.delete(code);
  };
}

export async function getRoomOnce(roomCode) {
  const code = normalizeRoomCode(roomCode);
  const room = roomStore.get(code);
  return room ? { ...room } : null;
}

