// services/firebaseClient.js
// Bootstrap Firebase (CDN v12) + exports. Sin lógica de UI.

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-analytics.js";
import {
  getDatabase, ref, set, get, update, runTransaction,
  onValue, off, onDisconnect, push, remove, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-database.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAWfXXTHjpVb4G2Nmct5Du7LYUf9R7RDYg",
  authDomain: "cuestionario-royal.firebaseapp.com",
  databaseURL: "https://cuestionario-royal-default-rtdb.firebaseio.com",
  projectId: "cuestionario-royal",
  storageBucket: "cuestionario-royal.firebasestorage.app",
  messagingSenderId: "479313524467",
  appId: "1:479313524467:web:7fc17f5a3d5cbd147ee986",
  measurementId: "G-SN4MMCJY7K"
};

const app = initializeApp(firebaseConfig);
// Analytics puede fallar en http/local; si te estorba, quítalo sin afectar la app.
try { getAnalytics(app); } catch (_) {}

export const database = getDatabase(app);
export const auth = getAuth(app);

/** Autenticación anónima garantizada. */
export async function ensureAuthenticated() {
  return new Promise((resolve, reject) => {
    onAuthStateChanged(auth, (user) => {
      if (user) return resolve(user);
      signInAnonymously(auth).then(r => resolve(r.user)).catch(reject);
    });
  });
}

// Re-export utilidades de DB para servicios
export {
  ref, set, get, update, runTransaction,
  onValue, off, onDisconnect, push, remove, serverTimestamp
};
