// services/gameService.js
// Lectura/suscripción a rooms/ y games/, helpers y acciones autoritativas.

import {
  database, ensureAuthenticated, ref, get, set, update, onValue, off,
  runTransaction, serverTimestamp
} from './firebaseClient.js';

// -------- Helpers de tiempo --------
export function resolveTimestampMs(ts) {
  if (!ts) return null;
  if (typeof ts === 'number') return ts;
  if (typeof ts === 'object' && typeof ts.seconds === 'number') {
    return ts.seconds * 1000 + Math.floor((ts.nanoseconds || 0) / 1e6);
  }
  return null;
}
export function tsToMs(ts) {
  if (!ts) return Number.MAX_SAFE_INTEGER;
  if (typeof ts === 'number') return ts;
  if (typeof ts === 'object' && typeof ts.seconds === 'number') {
    return ts.seconds * 1000 + Math.floor((ts.nanoseconds || 0) / 1e6);
  }
  return Number.MAX_SAFE_INTEGER;
}

// -------- Bootstrap / Auth --------
export async function ensureUser() {
  return await ensureAuthenticated();
}

// -------- Room --------
export async function getRoom(code) {
  const snap = await get(ref(database, `rooms/${code}`));
  return snap.exists() ? snap.val() : null;
}
export function subscribeRoom(code, cb) {
  const r = ref(database, `rooms/${code}`);
  const h = onValue(r, (s) => cb(s.exists() ? s.val() : null));
  return () => off(r, 'value', h);
}

// -------- Game --------
export async function getGame(code) {
  const snap = await get(ref(database, `games/${code}`));
  return snap.exists() ? snap.val() : null;
}
export function subscribeGame(code, cb) {
  const g = ref(database, `games/${code}`);
  const h = onValue(g, (s) => cb(s.exists() ? s.val() : null));
  return () => off(g, 'value', h);
}

export async function submitAnswer(code, qIndex, uid, answerIndex) {
  const answerRef = ref(database, `games/${code}/answers/${qIndex}/${uid}`);
  await set(answerRef, { answer: answerIndex, ts: serverTimestamp() });
}

export async function closeQuestionAsHost(code) {
  const baseRef = ref(database, `games/${code}`);

  await runTransaction(baseRef, (g) => {
    if (!g || g.phase !== 'question') return g;

    const qIndex = Number.isInteger(g.currentIndex) ? g.currentIndex : 0;
    const answers = (g.answers && g.answers[qIndex]) ? g.answers[qIndex] : {};
    const currentQ = (g.questions || [])[qIndex];
    if (!currentQ) { g.phase = 'finished'; return g; }

    const correct = currentQ.correctIndex;
    g.scores = g.scores || {};

    const winners = [];
    for (const [uid, a] of Object.entries(answers)) {
      if (a && Number.isInteger(a.answer) && a.answer === correct) {
        winners.push([uid, tsToMs(a.ts)]);
      }
    }
    winners.sort((a, b) => a[1] - b[1]);
    if (winners.length) {
      const [fastestUid] = winners[0];
      g.scores[fastestUid] = (g.scores[fastestUid] || 0) + 1;
    }

    g.phase = 'reveal';
    g.revealStartAt = serverTimestamp();
    return g;
  });

  // Avance tras 2s de reveal
  setTimeout(async () => {
    const snap = await get(baseRef);
    if (!snap.exists()) return;
    const g = snap.val();
    const total = (g.questions || []).length;
    const nextIndex = (Number.isInteger(g.currentIndex) ? g.currentIndex : 0) + 1;

    const updates = {};
    if (nextIndex < total) {
      updates.phase = 'question';
      updates.currentIndex = nextIndex;
      updates.questionStartAt = serverTimestamp();
    } else {
      updates.phase = 'finished';
    }
    await update(baseRef, updates);
  }, 2000);
}
