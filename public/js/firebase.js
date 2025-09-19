// src/lib/firebase.ts (o .js)
import { initializeApp } from "firebase/app";
import {
  getAuth, signInAnonymously, onAuthStateChanged
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";
// (Opcional) import { getAnalytics, isSupported } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyAWfXXTHjpVb4G2Nmct5Du7LYUf9R7RDYg",
  authDomain: "cuestionario-royal.firebaseapp.com",
  databaseURL: "https://cuestionario-royal-default-rtdb.firebaseio.com",
  projectId: "cuestionario-royal",
  storageBucket: "cuestionario-royal.firebasestorage.app",
  messagingSenderId: "479313524467",
  appId: "1:479313524467:web:d422ead4d2252e907ee986",
  measurementId: "G-564SB44X6N"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app);

// Analytics: útil en producción, mejor no bloquear nada si no está soportado
// export const analytics = (await isSupported()) ? getAnalytics(app) : null;

// === Helper MVP: garantizar sesión anónima ===
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
