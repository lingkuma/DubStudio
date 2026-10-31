export const normalizeConcurrency = (value: number) =>
  Number.isFinite(value) ? Math.max(1, Math.min(50, Math.round(value))) : 10;

type Job = {
  run: (signal: AbortSignal) => Promise<boolean>;
  cancel: () => void;
  controller: AbortController;
  promise: Promise<boolean>;
  resolve: (success: boolean) => void;
};

// Single-sentence and batch requests share slots and deduplicate by sentence.
export class GenerationPool {
  private waiting = new Map<string, Job>();
  private running = new Map<string, Job>();
  constructor(
    private limit: () => number,
    private changed: (active: number, queued: number) => void,
  ) {}
  enqueue(key: string, run: Job["run"], cancel: Job["cancel"]) {
    const existing = this.waiting.get(key) || this.running.get(key);
    if (existing) return existing.promise;
    let resolve!: Job["resolve"];
    const promise = new Promise<boolean>((r) => {
      resolve = r;
    });
    this.waiting.set(key, {
      run,
      cancel,
      controller: new AbortController(),
      promise,
      resolve,
    });
    this.pump();
    return promise;
  }
  has(key: string) {
    return this.waiting.has(key) || this.running.has(key);
  }
  pump() {
    while (
      this.waiting.size &&
      this.running.size < normalizeConcurrency(this.limit())
    ) {
      const [key, job] = this.waiting.entries().next().value!;
      this.waiting.delete(key);
      this.running.set(key, job);
      void Promise.resolve()
        .then(() => job.run(job.controller.signal))
        .catch(() => false)
        .then((success) => {
          this.running.delete(key);
          job.resolve(success);
          this.pump();
        });
    }
    this.changed(this.running.size, this.waiting.size);
  }
  cancel() {
    for (const job of this.waiting.values()) {
      job.cancel();
      job.resolve(false);
    }
    this.waiting.clear();
    for (const job of this.running.values()) job.controller.abort();
    this.changed(this.running.size, 0);
  }
}
