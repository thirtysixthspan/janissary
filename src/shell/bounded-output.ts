export const MAX_SHELL_OUTPUT_CHARS = 1_048_576;
export const SHELL_OUTPUT_TRUNCATION_NOTE = '(output truncated after 1 MiB)';
const MAX_PWD_PATH_CHARS = 4096;

function markerOverlap(text: string, marker: string): number {
  const limit = Math.min(text.length, marker.length - 1);
  for (let size = limit; size > 0; size -= 1) {
    if (text.endsWith(marker.slice(0, size))) return size;
  }
  return 0;
}

export class BoundedOutputAccumulator {
  private output = '';
  private pending = '';
  private isTruncated = false;
  private matched = false;

  constructor(
    private readonly marker: string,
    private readonly limit: number,
    private readonly onText: (text: string) => void = () => {},
  ) {}

  append(chunk: string): boolean {
    if (this.matched) return true;
    const overlapContext = `${this.pending}${chunk.slice(0, this.marker.length - 1)}`;
    const crossIndex = overlapContext.indexOf(this.marker);
    if (crossIndex !== -1) {
      this.commit(this.pending.slice(0, crossIndex));
      this.matched = true;
      this.pending = '';
      return true;
    }
    const directIndex = chunk.indexOf(this.marker);
    if (directIndex !== -1) {
      this.commit(this.pending + chunk.slice(0, directIndex));
      this.matched = true;
      this.pending = '';
      return true;
    }

    const context = `${this.pending}${chunk.slice(-this.marker.length + 1)}`;
    const overlap = markerOverlap(context, this.marker);
    const totalLength = this.pending.length + chunk.length;
    const safeLength = totalLength - overlap;
    const safePendingLength = Math.min(this.pending.length, safeLength);
    const safeChunkLength = Math.max(0, safeLength - this.pending.length);
    this.commit(this.pending.slice(0, safePendingLength) + chunk.slice(0, safeChunkLength));
    this.pending = this.pending.slice(safePendingLength) + chunk.slice(safeChunkLength);
    return false;
  }

  flush(): void {
    if (this.matched || this.pending === '') return;
    this.commit(this.pending);
    this.pending = '';
  }

  progress(): string {
    return this.withNote(this.output);
  }

  result(): string {
    return this.withNote(this.output.trim());
  }

  private commit(text: string): void {
    if (text === '') return;
    this.onText(text);
    const remaining = Math.max(0, this.limit - this.output.length);
    this.output += text.slice(0, remaining);
    if (text.length > remaining) this.isTruncated = true;
  }

  private withNote(text: string): string {
    if (!this.isTruncated) return text;
    return text ? `${text}\n${SHELL_OUTPUT_TRUNCATION_NOTE}` : SHELL_OUTPUT_TRUNCATION_NOTE;
  }
}

export class PwdPathAccumulator {
  private line = '';
  private lineTooLong = false;
  private lastPath = '';

  append(text: string): void {
    for (const character of text) {
      if (character === '\n') {
        this.finishLine();
        continue;
      }
      if (this.line.length < MAX_PWD_PATH_CHARS) this.line += character;
      else this.lineTooLong = true;
    }
  }

  answer(): string {
    this.finishLine();
    return this.lastPath;
  }

  private finishLine(): void {
    if (!this.lineTooLong) {
      const candidate = this.line.replaceAll('\r', '').trim();
      if (/^\/[^\p{Cc}]*$/u.test(candidate)) this.lastPath = candidate;
    }
    this.line = '';
    this.lineTooLong = false;
  }
}
