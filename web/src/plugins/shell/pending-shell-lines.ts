export class PendingShellLines {
  private readonly pending: string[] = [];

  expect(line: string): void {
    this.pending.push(line);
  }

  claim(command: string): boolean {
    const index = this.pending.findIndex((line) => line === command || line.startsWith(`${command}\n`));
    if (index === -1) return false;
    const line = this.pending[index];
    const rest = line === command ? [] : [line.slice(command.length + 1)];
    this.pending.splice(0, index + 1, ...rest);
    return true;
  }
}
