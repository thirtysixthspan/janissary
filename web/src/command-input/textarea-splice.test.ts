import { afterEach, describe, expect, it, vi } from 'vitest';
import { spliceIntoTextarea } from './textarea-splice';

function makeTextarea(value: string, start: number, end = start): HTMLTextAreaElement {
  const element = document.createElement('textarea');
  element.value = value;
  document.body.append(element);
  element.setSelectionRange(start, end);
  return element;
}

afterEach(() => {
  document.body.replaceChildren();
  // @ts-expect-error jsdom does not implement execCommand by default; restore that.
  delete document.execCommand;
});

describe('spliceIntoTextarea — fallback path', () => {
  it('inserts at the caret and leaves the caret after the inserted text', () => {
    const element = makeTextarea('open ', 5);
    spliceIntoTextarea(element, 'open ', 'src/index.ts');
    expect(element.value).toBe('open src/index.ts');
    expect(element.selectionStart).toBe(17);
    expect(element.selectionEnd).toBe(17);
  });

  it('replaces an active selection', () => {
    const element = makeTextarea('open oldpath', 5, 12);
    spliceIntoTextarea(element, 'open oldpath', 'newpath');
    expect(element.value).toBe('open newpath');
  });

  it('dispatches a bubbling input event so React sees the change', () => {
    const element = makeTextarea('', 0);
    const onInput = vi.fn();
    document.body.addEventListener('input', onInput);
    spliceIntoTextarea(element, '', 'ls');
    expect(onInput).toHaveBeenCalled();
    document.body.removeEventListener('input', onInput);
  });

  it('inserts a newline mid-value without disturbing the rest', () => {
    const element = makeTextarea('helloworld', 5);
    spliceIntoTextarea(element, 'helloworld', '\n');
    expect(element.value).toBe('hello\nworld');
    expect(element.selectionStart).toBe(6);
  });
});

describe('spliceIntoTextarea — execCommand path', () => {
  it('restores the caret range and delegates the insert to execCommand', () => {
    const execCommand = vi.fn();
    document.execCommand = execCommand;
    const element = makeTextarea('open ', 5);
    spliceIntoTextarea(element, 'open ', 'src/index.ts');
    expect(execCommand).toHaveBeenCalledWith('insertText', false, 'src/index.ts');
    expect(element.selectionStart).toBe(5);
  });
});
