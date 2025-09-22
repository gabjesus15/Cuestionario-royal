// utils/navigation.js
export function hydrateRoomCodeFromQuery() {
  const params = new URLSearchParams(location.search);
  const code = params.get('code');
  return code ? code.trim().toUpperCase() : null;
}

export function goToGame(code) {
  window.location.href = `./game.html?code=${encodeURIComponent(code)}`;
}
