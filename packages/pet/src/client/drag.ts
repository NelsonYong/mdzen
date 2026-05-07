const LONG_PRESS_MS = 400;

export interface DragMilestones {
  /** Fire when dragging crosses this duration (ms since held entered). */
  atMs: number;
  emit: () => void;
}

export interface DragOptions {
  trigger: HTMLElement;
  onDragStart: () => void;
  onDragMove: (x: number, y: number) => void;
  onDragEnd: (durationMs: number) => void;
  isBlocked?: () => boolean;
  /** Optional callbacks fired while held, e.g. show protest bubble after 1.5s. */
  milestones?: DragMilestones[];
}

export interface DragController {
  destroy(): void;
}

export function attachDrag(opts: DragOptions): DragController {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let dragging = false;
  let dragStartedAt = 0;
  let grabOffsetX = 0;
  let grabOffsetY = 0;
  const pendingMilestones: ReturnType<typeof setTimeout>[] = [];

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
      dragStartedAt = performance.now();
      opts.onDragStart();
      if (opts.milestones) {
        for (const m of opts.milestones) {
          pendingMilestones.push(setTimeout(() => m.emit(), m.atMs));
        }
      }
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
    for (const t of pendingMilestones) clearTimeout(t);
    pendingMilestones.length = 0;
    if (dragging) {
      dragging = false;
      const dur = performance.now() - dragStartedAt;
      opts.onDragEnd(dur);
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
      for (const t of pendingMilestones) clearTimeout(t);
    },
  };
}
