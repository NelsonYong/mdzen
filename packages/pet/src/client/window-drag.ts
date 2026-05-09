// Sprite gesture handling for the desktop "sprite" window.
//
// Drag is implemented by translating the OS window itself via Tauri's
// `set_position`, NOT by Tauri's `startDragging()` (which has known macOS
// bugs on transparent + decorations:false windows — see Tauri issue
// #12042) and NOT by full-screen click-through tricks (which run into
// issue #11461 / #13070 where set_ignore_cursor_events doesn't work
// reliably on transparent webviews).
//
// Three-step protocol with the Rust host:
//   1. mousedown → invoke('begin_window_drag') — Rust snapshots the
//      window's current outer position.
//   2. mousemove → invoke('drag_window_by', { dx, dy }) — Rust adds the
//      JS-supplied screen-space delta to the snapshot and calls
//      `set_position(new_x, new_y)`. We use `event.screenX/Y` not
//      `movementX/Y` because deltas relative to a moving window are
//      ambiguous; absolute screen coords minus the mousedown point are
//      monotonic regardless of how much the window has shifted.
//   3. mouseup → invoke('end_window_drag') (clears the snapshot) and
//      decide click-vs-drag from the total movement.

interface TauriCoreApi {
  invoke?: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
}

interface TauriGlobal {
  __TAURI__?: { core?: TauriCoreApi };
}

function tauriInvoke(cmd: string, args?: Record<string, unknown>): Promise<unknown> {
  const g = window as unknown as TauriGlobal;
  const inv = g.__TAURI__?.core?.invoke;
  if (!inv) return Promise.resolve();
  return inv(cmd, args).catch(() => undefined);
}

const DRAG_THRESHOLD_PX = 4;

export interface SpriteFloaterOptions {
  /** Element that captures mousedown — usually `sprite.img`. */
  el: HTMLElement;
  /** Fired on mouseup with no significant movement. */
  onClick: () => void;
}

export interface SpriteFloater {
  destroy(): void;
}

/**
 * Attach drag-to-move-window + click-to-toggle-input to the sprite element.
 * Click and drag are disambiguated by total screen-space movement during
 * the gesture (>4px = drag, otherwise click).
 */
export function attachSpriteFloater(opts: SpriteFloaterOptions): SpriteFloater {
  const el = opts.el;
  el.style.cursor = 'grab';
  el.style.userSelect = 'none';
  el.style.touchAction = 'none';
  if (el.tagName === 'IMG') (el as HTMLImageElement).draggable = false;
  el.setAttribute('data-tauri-drag-region', 'false');

  let dragging = false;
  let pressScreenX = 0;
  let pressScreenY = 0;
  let dragMoved = false;

  const onMouseDown = (e: MouseEvent): void => {
    if (e.button !== 0) return;
    e.preventDefault();
    dragging = true;
    dragMoved = false;
    pressScreenX = e.screenX;
    pressScreenY = e.screenY;
    el.style.cursor = 'grabbing';
    // Snapshot window origin server-side. Fire and forget — the next
    // mousemove will arrive in a few ms, by which time begin_window_drag
    // has resolved on the Rust side. drag_window_by no-ops if the snapshot
    // hasn't landed yet.
    void tauriInvoke('begin_window_drag');
    window.addEventListener('mousemove', onDragMove);
    window.addEventListener('mouseup', onDragUp, { once: true });
  };

  const onDragMove = (e: MouseEvent): void => {
    if (!dragging) return;
    const dx = e.screenX - pressScreenX;
    const dy = e.screenY - pressScreenY;
    if (!dragMoved && (Math.abs(dx) > DRAG_THRESHOLD_PX || Math.abs(dy) > DRAG_THRESHOLD_PX)) {
      dragMoved = true;
    }
    if (dragMoved) {
      void tauriInvoke('drag_window_by', { dx, dy });
    }
  };

  const onDragUp = (): void => {
    dragging = false;
    el.style.cursor = 'grab';
    window.removeEventListener('mousemove', onDragMove);
    void tauriInvoke('end_window_drag');
    if (!dragMoved) {
      opts.onClick();
    }
  };

  const onDragStart = (e: DragEvent): void => {
    e.preventDefault();
  };

  el.addEventListener('mousedown', onMouseDown);
  el.addEventListener('dragstart', onDragStart);

  return {
    destroy() {
      el.removeEventListener('mousedown', onMouseDown);
      el.removeEventListener('dragstart', onDragStart);
      if (dragging) {
        window.removeEventListener('mousemove', onDragMove);
        void tauriInvoke('end_window_drag');
      }
    },
  };
}
