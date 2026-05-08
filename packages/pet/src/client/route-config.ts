// Route prefix lookup. Embedders set window.__SEREN_CONFIG__.routePrefix
// at load time (the server's scriptTag() does this automatically). Default
// matches the historical mdzen wiring so this is a no-op for existing setups.
export function getRoutePrefix(): string {
  const cfg = (window as { __SEREN_CONFIG__?: { routePrefix?: string } }).__SEREN_CONFIG__;
  const raw = cfg?.routePrefix ?? '/api/pet';
  return raw.replace(/\/$/, '');
}
