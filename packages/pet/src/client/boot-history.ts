// History-only bootstrap. Used by the desktop "history window" (resizable,
// proper window chrome). Renders the existing history modal as the entire
// window content rather than as an overlay.

import { showHistoryModal } from './history-modal.ts';
import { getSessionId } from './session.ts';

declare global {
  interface Window {
    __seren_history?: { close: () => void };
  }
}

export function bootHistory(): void {
  if (window.__seren_history) return;
  const sessionId = getSessionId();

  // Strip default page chrome — the modal owns the visual surface.
  const style = document.createElement('style');
  style.textContent = `
    html, body {
      margin: 0; padding: 0;
      width: 100vw; height: 100vh;
      background: #14141c;
      color: #d8d8d8;
      font: 13px/1.5 -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
      overflow: hidden;
    }
    /* Pin the modal to fill the viewport — by default it's an overlay
       centered on screen. Here it IS the window, so make it span. */
    .mdzen-pet-history-modal {
      position: fixed !important;
      inset: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      max-width: 100vw !important;
      max-height: 100vh !important;
      border-radius: 0 !important;
    }
    .mdzen-pet-history-backdrop { display: none !important; }
  `;
  document.head.appendChild(style);

  void showHistoryModal(sessionId);

  window.__seren_history = {
    close: () => {
      const tauri = (window as { __TAURI__?: { core?: { invoke?: Function } } }).__TAURI__;
      tauri?.core?.invoke?.('hide_history_window').catch(() => {});
    },
  };

  window.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      const tauri = (window as { __TAURI__?: { core?: { invoke?: Function } } }).__TAURI__;
      tauri?.core?.invoke?.('hide_history_window').catch(() => {});
    }
  });
}
