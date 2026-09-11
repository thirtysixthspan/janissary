import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyText, pasteInto } from './clipboard-commands';

// jsdom implements neither the clipboard events nor the async clipboard, so both are stood up here
// in the shape the browser gives them: an event carrying a `clipboardData` bag of typed strings.
class FakeDataTransfer {
  private readonly entries = new Map<string, string>();
  setData(type: string, value: string) { this.entries.set(type, value); }
  getData(type: string) { return this.entries.get(type) ?? ''; }
}

class FakeClipboardEvent extends Event {
  readonly clipboardData: FakeDataTransfer | null;
  constructor(type: string, init: EventInit & { clipboardData?: FakeDataTransfer } = {}) {
    super(type, init);
    this.clipboardData = init.clipboardData ?? null;
  }
}

function stubClipboardEvents() {
  vi.stubGlobal('DataTransfer', FakeDataTransfer);
  vi.stubGlobal('ClipboardEvent', FakeClipboardEvent);
}

function stubClipboard(text: string) {
  vi.stubGlobal('navigator', { clipboard: { readText: () => Promise.resolve(text) } });
}

function field(): HTMLTextAreaElement {
  const element = document.createElement('textarea');
  document.body.append(element);
  return element;
}

// `document.execCommand` is absent in jsdom, so it is defined rather than spied on.
function stubExecCommand() {
  const execCommand = vi.fn<(id: string, showUi?: boolean, value?: string) => boolean>(() => true);
  Object.defineProperty(document, 'execCommand', { value: execCommand, configurable: true });
  return execCommand;
}

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(document, 'execCommand');
  document.body.replaceChildren();
});

describe('copyText', () => {
  it('writes the text to the system clipboard', () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    copyText('selected text');
    expect(writeText).toHaveBeenCalledWith('selected text');
  });

  it('writes nothing when there is no text', () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    copyText('');
    expect(writeText).not.toHaveBeenCalled();
  });

  it('does not throw when the browser withholds the clipboard', () => {
    vi.stubGlobal('navigator', {});
    expect(() => copyText('selected text')).not.toThrow();
  });
});

describe('pasteInto', () => {
  it('focuses the target and dispatches a paste event carrying the clipboard text', async () => {
    stubClipboardEvents();
    stubClipboard('pasted text');
    const element = field();
    const pasted = vi.fn((event: Event) => {
      event.preventDefault();
      return (event as FakeClipboardEvent).clipboardData?.getData('text/plain');
    });
    element.addEventListener('paste', pasted);
    await pasteInto(element);
    expect(document.activeElement).toBe(element);
    expect(pasted).toHaveReturnedWith('pasted text');
  });

  it('inserts at the caret when nothing handled the paste event', async () => {
    stubClipboardEvents();
    stubClipboard('pasted text');
    const execCommand = stubExecCommand();
    await pasteInto(field());
    expect(execCommand).toHaveBeenCalledWith('insertText', false, 'pasted text');
  });

  it('leaves the caret alone when a surface handled the paste event itself', async () => {
    stubClipboardEvents();
    stubClipboard('pasted text');
    const execCommand = stubExecCommand();
    const element = field();
    element.addEventListener('paste', (event) => event.preventDefault());
    await pasteInto(element);
    expect(execCommand).not.toHaveBeenCalled();
  });

  it('inserts nothing when the clipboard is empty', async () => {
    stubClipboardEvents();
    stubClipboard('');
    const execCommand = stubExecCommand();
    const pasted = vi.fn();
    const element = field();
    element.addEventListener('paste', pasted);
    await pasteInto(element);
    expect(pasted).not.toHaveBeenCalled();
    expect(execCommand).not.toHaveBeenCalled();
  });

  it('falls back to inserting when the browser has no clipboard events', async () => {
    stubClipboard('pasted text');
    const execCommand = stubExecCommand();
    await pasteInto(field());
    expect(execCommand).toHaveBeenCalledWith('insertText', false, 'pasted text');
  });

  it('does not throw when the browser withholds the clipboard', async () => {
    vi.stubGlobal('navigator', {});
    await expect(pasteInto(field())).resolves.toBeUndefined();
  });
});
