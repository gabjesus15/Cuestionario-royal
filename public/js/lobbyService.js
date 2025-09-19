import { firebaseConfig } from "./firebase.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import {
  getAuth, signInAnonymously, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import {
  getFirestore, doc, onSnapshot
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import {
  getFunctions, httpsCallable
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-functions.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app);

// Mantiene sesión anónima para MVP
export function ensureSignedIn() {
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

// Callables
const createRoomSecure = httpsCallable(functions, "createRoomSecure");
const joinRoomSecure   = httpsCallable(functions, "joinRoomSecure");
const addAIPlayer      = httpsCallable(functions, "addAIPlayer");
const startGameSecure  = httpsCallable(functions, "startGameSecure");

export async function createRoom(playerName, avatar) {
  await ensureSignedIn();
  const res = await createRoomSecure({ playerName, avatar });
  return res.data; // { roomCode }
}

export async function joinRoom(roomCode, playerName, avatar) {
  await ensureSignedIn();
  const res = await joinRoomSecure({ roomCode, playerName, avatar });
  return res.data;
}

export async function addAI(roomCode) {
  await ensureSignedIn();
  const res = await addAIPlayer({ roomCode });
  return res.data;
}

export async function startGame(roomCode) {
  await ensureSignedIn();
  const res = await startGameSecure({ roomCode });
  return res.data;
}

export function subscribeRoom(roomCode, cb) {
  const ref = doc(db, "rooms", roomCode.toUpperCase());
  return onSnapshot(ref, (snap) => cb(snap.data()));
}
