type Listener = (busy: boolean) => void;

class BusyController {
  private busy = false;
  private listeners = new Set<Listener>();

  set(value: boolean): void {
    if (value === this.busy) return;
    this.busy = value;
    for (const l of this.listeners) l(value);
  }

  isBusy(): boolean {
    return this.busy;
  }

  onChange(cb: Listener): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
}

export const globalBusy = new BusyController();
