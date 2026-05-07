const LONG_PRESS_MS = 400;

export interface DragOptions {
  trigger: HTMLElement;
  onDragStart: () => void;
  onDragMove: (x: number, y: number) => void;
  onDragEnd: () => void;
  isBlocked?: () => boolean;
}

export interface DragController {
  destroy(): void;
}

export function attachDrag(opts: DragOptions): DragController {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let dragging = false;
  let grabOffsetX = 0;
  let grabOffsetY = 0;

  const onMouseDown = (e: MouseEvent): void => {
    if (e.button !== 0) return;
    if (opts.isBlocked?.()) return;
    e.preventDefault();
    const rect = opts.trigger.getBoundingClientRect();
    grabOffsetX = e.clientX - rect.left;
    grabOffsetY = e.clientY - rect.top;
    timer = setTimeout(() => {
      timer = null;
      if (opts.isBlocked?.()) return;
      dragging = true;
      opts.onDragStart();
    }, LONG_PRESS_MS);
  };

  const onMouseMove = (e: MouseEvent): void => {
    if (!dragging) return;
    opts.onDragMove(e.clientX - grabOffsetX, e.clientY - grabOffsetY);
  };

  const onMouseUp = (): void => {
    if (timer != null) {
      clearTimeout(timer);
      timer = null;
    }
    if (dragging) {
      dragging = false;
      opts.onDragEnd();
    }
  };

  opts.trigger.addEventListener('mousedown', onMouseDown);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);

  return {
    destroy() {
      opts.trigger.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      if (timer != null) clearTimeout(timer);
    },
  };
}
