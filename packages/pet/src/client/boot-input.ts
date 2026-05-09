// Input-only bootstrap. Used by the desktop "input window" (a separate
// floating prompt window, like Claude Desktop's Cmd+Space). Only renders
// the chat input bar; the streamed reply lands in the sprite window's
// SSE listener, not here. We POST and forget.

import { InputBar } from './input-bar.ts';
import { postChat } from './sse-consumer.ts';
import { getSessionId } from './session.ts';

declare global {
  interface Window {
    __seren_input?: {
      open: () => void;
      destroy: () => void;
    };
  }
}

export function bootInput(): void {
  if (window.__seren_input) return;
  const sessionId = getSessionId();

  injectInputShellStyles();

  const inputBar = new InputBar({
    placeholder: '想问什么? Enter 发送, Esc 收起',
    // The bar IS the entire window. The default outside-click-closes
    // behavior would let any stray click on the transparent gap close
    // the bar, leaving an empty floating window onscreen.
    disableOutsideClickClose: true,
    onSubmit: (text) => {
      void (async () => {
        try {
          await postChat(sessionId, text);
        } catch {
          // Silent — sprite window surfaces backend errors via its SSE.
        }
        // After submit, ask the host to hide this window so the sprite
        // reply has the foreground. Tauri command in desktop shell;
        // browser embedded mode this is a no-op.
        invokeHide();
      })();
    },
    onOpenHistory: () => {
      const tauri = (window as { __TAURI__?: { core?: { invoke?: Function } } }).__TAURI__;
      tauri?.core?.invoke?.('show_history_window').catch(() => {});
    },
  });

  // Open immediately on load.
  setTimeout(() => inputBar.toggle(), 30);

  // Refocus the input every time the OS window regains focus. Without this
  // the user has to click the input field after every Cmd+Shift+K toggle.
  // macOS combined with `accept_first_mouse(true)` on the Rust side makes
  // the first click reach us; this listener handles every subsequent show.
  const refocus = (): void => {
    // requestAnimationFrame so the show animation has settled and the
    // textarea is actually in the layout tree.
    requestAnimationFrame(() => inputBar.focusInput());
  };
  window.addEventListener('focus', refocus);
  // First-paint focus: when the page loads (window may already be focused).
  refocus();

  // Esc → close window. The InputBar's input handler already swallows Esc
  // when focused; this handles the unfocused-window-but-focused-shell case.
  window.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      invokeHide();
    }
  });

  window.__seren_input = {
    open: () => inputBar.toggle(),
    destroy: () => {
      window.removeEventListener('focus', refocus);
      inputBar.destroy();
      window.__seren_input = undefined;
    },
  };
}

function invokeHide(): void {
  const tauri = (window as { __TAURI__?: { core?: { invoke?: Function } } }).__TAURI__;
  tauri?.core?.invoke?.('hide_input_window').catch(() => {});
}

function injectInputShellStyles(): void {
  if (document.getElementById('__seren_input_shell__')) return;
  const style = document.createElement('style');
  style.id = '__seren_input_shell__';
  style.textContent = `
    html, body {
      margin: 0; padding: 0;
      width: 100vw; height: 100vh;
      background: transparent;
      overflow: hidden;
      font: 13px/1.5 -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
    }
  `;
  document.head.appendChild(style);
}
