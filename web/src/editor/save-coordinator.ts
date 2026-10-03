import { contentHash } from '@shared/editor/save-conflict';

type Write = (text: string, expectedHash?: string) => Promise<void>;
type PendingSave = {
  text: string;
  overwrite: boolean;
  write: Write;
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: unknown) => void;
};

export class SaveCoordinator {
  private baseline: string | null = null;
  private pending: PendingSave[] = [];

  setBaseline(text: string): void {
    this.baseline = text;
  }

  save(text: string, write: Write, overwrite = false): Promise<void> {
    const last = this.pending.at(-1);
    if (last?.text === text && last.overwrite === overwrite) return last.promise;
    let resolve!: () => void;
    let reject!: (error: unknown) => void;
    // eslint-disable-next-line unicorn/prefer-promise-with-resolvers -- the web project's ES2023 library excludes Promise.withResolvers
    const promise = new Promise<void>((accept, refuse) => { resolve = accept; reject = refuse; });
    this.pending.push({ text, write, overwrite, promise, resolve, reject });
    if (this.pending.length === 1) void this.flush();
    return promise;
  }

  private async flush(): Promise<void> {
    while (this.pending.length > 0) {
      const current = this.pending[0];
      try {
        const expectedHash = current.overwrite || this.baseline === null ? undefined : contentHash(this.baseline);
        await current.write(current.text, expectedHash);
        this.baseline = current.text;
        this.pending.shift();
        current.resolve();
      } catch (error) {
        const failed = this.pending;
        this.pending = [];
        for (const request of failed) request.reject(error);
      }
    }
  }
}
