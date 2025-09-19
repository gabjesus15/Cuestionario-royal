import { firebaseConfig } from "./firebase.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import {
  getAuth, signInAnonymously, onAuthStateChanged, setPersistence, browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import {
  getFirestore, doc, onSnapshot, getDoc
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import {
  getFunctions, httpsCallable, connectFunctionsEmulator
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-functions.js";

// --- Inicialización ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Ajusta la región a la que desplegaste tus Functions (por defecto "us-central1")
const functions = getFunctions(app, "us-central1");

// === OPCIONAL: EMULADORES EN DEV ===
// if (location.hostname === "localhost") {
//   // Puerto por defecto Functions: 5001
//   connectFunctionsEmulator(functions, "localhost", 5001);
//   // Para Firestore/Auth usa connectFirestoreEmulator / connectAuthEmulator si lo requieres
// }

// --- Utilidades ---
function normalizeRoomCode(code) {
  return String(code || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}
function normalizeName(name) {
  return String(name || "").trim().slice(0, 40);
}

// Mantiene sesión anónima, persistente en el navegador
export async function ensureSignedIn() {
  await setPersistence(auth, browserLocalPersistence);
  return new Promise((resolve, reject) => {
    onAuthStateChanged(auth, async (u) => {
      try {
        if (!u) {
          const cred = await signInAnonymously(auth);
          resolve(cred.user);
        } else {
          resolve(u);
        }
      } catch (e) { reject(e); }
    });
  });
}

// --- Callables con manejo de errores uniforme ---
const _createRoomSecure = httpsCallable(functions, "createRoomSecure");
const _joinRoomSecure   = httpsCallable(functions, "joinRoomSecure");
const _addAIPlayer      = httpsCallable(functions, "addAIPlayer");
const _startGameSecure  = httpsCallable(functions, "startGameSecure");

async function callSafe(fn, payload) {
  try {
    const res = await fn(payload);
    return res?.data;
  } catch (err) {
    // Mapea errores comunes de httpsCallable
    const msg = err?.message || err?.details || "Error de red o permisos.";
    throw new Error(msg);
  }
}

// --- API pública ---
export async function createRoom(playerName, avatar) {
  await ensureSignedIn();
  const name = normalizeName(playerName);
  if (!name) throw new Error("El nombre es requerido.");
  const data = await callSafe(_createRoomSecure, { playerName: name, avatar: avatar || "🚀" });
  return data; // { roomCode }
}

export async function joinRoom(roomCode, playerName, avatar) {
  await ensureSignedIn();
  const code = normalizeRoomCode(roomCode);
  const name = normalizeName(playerName);
  if (!name || !code) throw new Error("Nombre y código son requeridos.");
  return await callSafe(_joinRoomSecure, { roomCode: code, playerName: name, avatar: avatar || "🎯" });
}

export async function addAI(roomCode) {
  await ensureSignedIn();
  const code = normalizeRoomCode(roomCode);
  if (!code) throw new Error("Código requerido.");
  return await callSafe(_addAIPlayer, { roomCode: code });
}

export async function startGame(roomCode) {
  await ensureSignedIn();
  const code = normalizeRoomCode(roomCode);
  if (!code) throw new Error("Código requerido.");
  return await callSafe(_startGameSecure, { roomCode: code });
}

// Suscripción en tiempo real; devuelve función para desuscribirse
export function subscribeRoom(roomCode, cb) {
  const code = normalizeRoomCode(roomCode);
  const ref = doc(db, "rooms", code);
  return onSnapshot(ref, (snap) => cb(snap.data()));
}

// Lectura puntual del room (útil para comprobaciones sin iniciar listener)
export async function getRoomOnce(roomCode) {
  const code = normalizeRoomCode(roomCode);
  const snap = await getDoc(doc(db, "rooms", code));
  return snap.exists() ? snap.data() : null;
}

// Re-export útiles por si te sirven en otras partes
export { auth, db };
