interface AudioTimeWait {
  promise: Promise<boolean>;
  cancel: () => void;
}

class AudioTimeScheduler {
  private readonly _ctx: BaseAudioContext;
  private readonly _pollInterval: number;
  private readonly _cancellations = new Set<() => void>();
  private _destroyed = false;

  constructor(ctx: BaseAudioContext, pollInterval = 0.01) {
    this._ctx = ctx;
    this._pollInterval = pollInterval;
  }

  waitUntil(targetTime: number): AudioTimeWait {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let resolvePromise!: (completed: boolean) => void;
    let settled = false;

    const finish = (completed: boolean) => {
      if (settled) return;
      settled = true;
      if (timer !== null) clearTimeout(timer);
      this._cancellations.delete(cancel);
      resolvePromise(completed);
    };
    const cancel = () => finish(false);
    const check = () => {
      if (this._destroyed) {
        finish(false);
      } else if (this._ctx.currentTime >= targetTime) {
        finish(true);
      } else {
        timer = setTimeout(check, this._pollInterval * 1000);
      }
    };
    const promise = new Promise<boolean>((resolve) => {
      resolvePromise = resolve;
    });

    if (this._destroyed) {
      finish(false);
    } else {
      this._cancellations.add(cancel);
      check();
    }
    return { promise, cancel };
  }

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    for (const cancel of [...this._cancellations]) cancel();
    this._cancellations.clear();
  }
}

export default AudioTimeScheduler;
export type { AudioTimeWait };
