import { describe, expect, it } from 'vitest';
import xterm from '@xterm/headless';
import type { IMarker, Terminal } from '@xterm/xterm';
import { ReplyPlacement } from './reply-placement';
import { writeShellEcho, writeShellReply } from './write-shell-reply';

const COMMAND = 'acp 12345678901234567890123456';
const BODY = 'Done';

type Headless = InstanceType<typeof xterm.Terminal>;

function headless(): Headless {
  return new xterm.Terminal({ cols: 20, rows: 10, allowProposedApi: true });
}

function asWriterTerminal(terminal: Headless): Terminal {
  return terminal as unknown as Terminal;
}

async function settle(terminal: Headless): Promise<void> {
  await new Promise<void>((resolve) => { terminal.write('', resolve); });
}

function cursorRow(terminal: Headless): number {
  return terminal.buffer.active.baseY + terminal.buffer.active.cursorY;
}

function rowEndingFrom(terminal: Headless, row: number): number {
  let last = row;
  while (terminal.buffer.active.getLine(last + 1)?.isWrapped) last += 1;
  return last;
}

function bodyRow(terminal: Headless): number {
  const buffer = terminal.buffer.active;
  for (let row = 0; row < buffer.length; row++) {
    if (buffer.getLine(row)?.translateToString(true) === BODY) return row;
  }
  throw new Error('the reply body is not on screen');
}

describe('the marker row across a resize', () => {
  it('keeps an echo marker on the first row of its line through narrowing and widening', async () => {
    const terminal = headless();
    try {
      const { marker, control } = await new Promise<{ marker: IMarker; control: IMarker | undefined }>((resolve) => {
        writeShellEcho(asWriterTerminal(terminal), new ReplyPlacement(), COMMAND, (made) => {
          resolve({ marker: made, control: terminal.registerMarker(-1) });
        });
      });

      expect(marker.line).toBe(0);
      expect(control?.line).toBe(1);
      expect(rowEndingFrom(terminal, marker.line)).toBe(cursorRow(terminal) - 1);

      terminal.resize(8, 10);

      expect(marker.isDisposed).toBe(false);
      expect(marker.line).toBe(0);
      expect(control?.isDisposed).toBe(false);
      expect(rowEndingFrom(terminal, marker.line)).toBe(cursorRow(terminal) - 1);

      terminal.resize(80, 10);

      expect(marker.isDisposed).toBe(false);
      expect(marker.line).toBe(0);
      expect(control?.isDisposed).toBe(true);
      expect(rowEndingFrom(terminal, marker.line)).toBe(cursorRow(terminal) - 1);
    } finally { terminal.dispose(); }
  });

  it('keeps a reply head marker on the first row of its line, directly above the reply body', async () => {
    const terminal = headless();
    try {
      const placement = new ReplyPlacement();
      placement.wrote();
      const marker = await new Promise<IMarker>((resolve) => {
        writeShellReply(asWriterTerminal(terminal), placement, COMMAND, BODY, () => {}, resolve);
      });
      await settle(terminal);

      expect(marker.line).toBe(0);
      expect(rowEndingFrom(terminal, marker.line)).toBe(bodyRow(terminal) - 1);

      terminal.resize(8, 10);

      expect(marker.isDisposed).toBe(false);
      expect(marker.line).toBe(0);
      expect(rowEndingFrom(terminal, marker.line)).toBe(bodyRow(terminal) - 1);

      terminal.resize(80, 10);

      expect(marker.isDisposed).toBe(false);
      expect(marker.line).toBe(0);
      expect(rowEndingFrom(terminal, marker.line)).toBe(bodyRow(terminal) - 1);
    } finally { terminal.dispose(); }
  });
});
