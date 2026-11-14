import type { ActiveAttemptModule } from "./active-attempt-module.ts";
import type { AttemptTranscriptItem } from "../runtime-contract.ts";

// Each streaming attempt has at most one unacknowledged item. Bound each
// transaction as well so a burst across many attempts cannot monopolize a turn.
const batchSize = 8;
const collectionMilliseconds = 4;
type Write = { attemptId: string; ordinal: number; item: AttemptTranscriptItem; resolve(): void; reject(error: unknown): void };

export class TranscriptWriteBatch {
  readonly #attempts: ActiveAttemptModule;
  readonly #pending: Write[] = [];
  #timer: ReturnType<typeof setTimeout> | undefined;
  #closed = false;

  constructor(attempts: ActiveAttemptModule) { this.#attempts = attempts; }

  enqueue(attemptId: string, ordinal: number, item: AttemptTranscriptItem): Promise<void> {
    if (this.#closed) return Promise.reject(new Error("Transcript persistence is closed"));
    return new Promise((resolve, reject) => {
      this.#pending.push({ attemptId, ordinal, item, resolve, reject });
      this.#schedule();
    });
  }

  close(): void {
    this.#closed = true;
    clearTimeout(this.#timer);
    this.#timer = undefined;
    for (const write of this.#pending.splice(0)) write.reject(new Error("Transcript persistence is closed"));
  }

  #schedule(): void {
    this.#timer ??= setTimeout(() => this.#flush(), collectionMilliseconds);
  }

  #flush(): void {
    this.#timer = undefined;
    const batch = this.#pending.splice(0, batchSize);
    try {
      this.#attempts.recordTranscriptItems(batch);
      for (const write of batch) write.resolve();
    } catch (error) {
      for (const write of batch) write.reject(error);
    }
    if (this.#pending.length > 0) this.#schedule();
  }
}
