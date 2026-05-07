export interface Rect { x: number; y: number; w: number; h: number; }

export interface ComputeBoundInput {
  viewport: { w: number; h: number };
  excluded: Rect[];
  padding: number;
}

export function computeBound(input: ComputeBoundInput): Rect {
  let x = 0;
  let y = 0;
  let w = input.viewport.w;
  let h = input.viewport.h;
  for (const ex of input.excluded) {
    const touchesLeft = ex.x <= x;
    const touchesRight = ex.x + ex.w >= x + w;
    const touchesTop = ex.y <= y;
    const touchesBottom = ex.y + ex.h >= y + h;
    if (touchesLeft && ex.w < w) {
      const cut = ex.x + ex.w - x;
      x += cut; w -= cut;
    } else if (touchesRight && ex.w < w) {
      w -= (x + w) - ex.x;
    } else if (touchesTop && ex.h < h) {
      const cut = ex.y + ex.h - y;
      y += cut; h -= cut;
    } else if (touchesBottom && ex.h < h) {
      h -= (y + h) - ex.y;
    }
  }
  return {
    x: x + input.padding,
    y: y + input.padding,
    w: Math.max(0, w - input.padding * 2),
    h: Math.max(0, h - input.padding * 2),
  };
}

export function clampPoint(p: { x: number; y: number }, b: Rect): { x: number; y: number } {
  return {
    x: Math.max(b.x, Math.min(b.x + b.w, p.x)),
    y: Math.max(b.y, Math.min(b.y + b.h, p.y)),
  };
}
