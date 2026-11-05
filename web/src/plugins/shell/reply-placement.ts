type Placed = { kind: 'echo' | 'reply'; line: string; at: number };

// Decides whether a command line the tab writes into the terminal needs to be written again.
//
// An ACP command is echoed the moment the application accepts it, and its reply arrives later. The
// reply continues beneath that echo only when nothing else reached the terminal in between; anything
// written since (shell output, another reply, another echo) means the reply repeats its line at the
// current bottom. The reverse can happen too: a reply settled synchronously can reach the client
// before the dispatch answer that would echo its line, and then the echo is the one to skip.
//
// Every write is counted rather than the cursor read, so the answer is exact and synchronous: data
// xterm has queued but not yet parsed has already been counted.
export class ReplyPlacement {
  private writes = 0;
  private last: Placed | undefined;

  wrote(): void {
    this.writes += 1;
  }

  // Answers whether the echo should be written; false when this line's reply was the last write.
  echo(line: string): boolean {
    const last = this.take();
    if (last?.kind === 'reply' && last.line === line) return false;
    this.place('echo', line);
    return true;
  }

  // Answers whether the reply must carry its line; false when it continues beneath its own echo.
  reply(line: string): boolean {
    const last = this.take();
    if (last?.kind === 'echo' && last.line === line) {
      this.wrote();
      return false;
    }
    this.place('reply', line);
    return true;
  }

  private take(): Placed | undefined {
    const last = this.last?.at === this.writes ? this.last : undefined;
    this.last = undefined;
    return last;
  }

  private place(kind: Placed['kind'], line: string): void {
    this.wrote();
    this.last = { kind, line, at: this.writes };
  }
}
