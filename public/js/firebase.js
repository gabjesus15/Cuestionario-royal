// Configuración de Firebase usando CDN
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-analytics.js";
import {
  getDatabase,
  ref,
  set,
  get,
  update,          // 👈 agregado
  runTransaction,  // 👈 agregado
  onValue,
  off,             // 👈 agregado
  onDisconnect,    // 👈 agregado
  push,
  remove,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-database.js";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";

// Your web app's Firebase configuration
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

// Initialize Firebase
const app = initializeApp(firebaseConfig);
// Analytics puede fallar en http/local; si no lo necesitas, puedes quitar esta línea.
const analytics = getAnalytics(app);

const database = getDatabase(app);
const auth = getAuth(app);

// Autenticación anónima garantizada
export async function ensureAuthenticated() {
  return new Promise((resolve, reject) => {
    onAuthStateChanged(auth, (user) => {
      if (user) {
        resolve(user);
      } else {
        signInAnonymously(auth)
          .then((result) => resolve(result.user))
          .catch((error) => reject(error));
      }
    });
  });
}

// Exportar instancias y utilidades para el resto de módulos
export {
  database,
  auth,
  // database API
  ref,
  set,
  get,
  update,
  runTransaction,
  onValue,
  off,
  onDisconnect,
  push,
  remove,
  serverTimestamp
};
