// Stable session id shared across all desktop windows of the same Tauri
// app (sprite / input / history). They share an origin (localhost:PORT)
// so localStorage is shared. Browser embedded mode also benefits: same
// window keeps the same session across reloads.

const KEY = 'seren-session-v1';

export function getSessionId(): string {
  let id: string | null = null;
  try {
    id = localStorage.getItem(KEY);
  } catch {
    /* private mode etc. — fall through to ephemeral */
  }
  if (id) return id;
  id =
    typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `s${Date.now()}-${Math.random().toString(36).slice(2)}`;
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* ignore — in private mode subsequent calls regenerate, that's OK */
  }
  return id;
}
