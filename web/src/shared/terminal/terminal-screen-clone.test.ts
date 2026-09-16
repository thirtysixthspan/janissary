import { describe, expect, it, vi } from 'vitest';
import type { Terminal } from '@xterm/xterm';
import { freezeTerminalScreen } from './terminal-screen-clone';

function boxed(node: HTMLElement, box: Partial<DOMRect>): HTMLElement {
  vi.spyOn(node, 'getBoundingClientRect').mockReturnValue(box as DOMRect);
  return node;
}

function container(box: Partial<DOMRect>): HTMLElement {
  return boxed(document.createElement('div'), box);
}

// What the DOM renderer leaves in the document: an owner class on the terminal's root, a screen box
// holding the stylesheets it injected, and one row container of spans carrying its colour classes
// under an inline letter-spacing correction.
function renderedTerminal(box: Partial<DOMRect>): HTMLElement {
  const root = document.createElement('div');
  root.className = 'xterm xterm-dom-renderer-owner-3';
  root.innerHTML = `
    <div class="xterm-screen">
      <style>.xterm-dom-renderer-owner-3 .xterm-rows { color: #fff; }</style>
      <div class="xterm-rows xterm-focus" style="letter-spacing: 0.25px;">
        <div style="width: 800px; height: 20px;"><span class="xterm-fg-2 xterm-bold">ok</span></div>
        <div style="width: 800px; height: 20px;"><span class="xterm-cursor xterm-cursor-blink">x</span></div>
      </div>
      <div class="xterm-selection"></div>
    </div>`;
  boxed(root.querySelector('.xterm-screen') as HTMLElement, box);
  return root;
}

function fakeTerminal(element?: HTMLElement, cols = 80, rows = 24): Terminal {
  return { element, cols, rows } as unknown as Terminal;
}

const SCREEN_BOX = { left: 14, top: 6, width: 800, height: 480 };
const CONTAINER_BOX = { left: 4, top: 2, width: 900, height: 600 };

describe('freezeTerminalScreen', () => {
  it('reads the grid off the screen box and places it inside the container', () => {
    const root = renderedTerminal(SCREEN_BOX);
    const frozen = freezeTerminalScreen(fakeTerminal(root), container(CONTAINER_BOX));
    expect(frozen.metrics).toEqual({ cellWidth: 10, cellHeight: 20, offsetLeft: 10, offsetTop: 4 });
  });

  it('carries the terminal root class list so the renderer rules reach the clone', () => {
    const root = renderedTerminal(SCREEN_BOX);
    const frozen = freezeTerminalScreen(fakeTerminal(root), container(CONTAINER_BOX));
    expect(frozen.ownerClass).toBe('xterm xterm-dom-renderer-owner-3');
  });

  it('clones the rendered rows with their colour classes and inline spacing intact', () => {
    const root = renderedTerminal(SCREEN_BOX);
    const frozen = freezeTerminalScreen(fakeTerminal(root), container(CONTAINER_BOX));
    const node = frozen.node!;
    expect(node.querySelector('.xterm-fg-2.xterm-bold')?.textContent).toBe('ok');
    expect(node.querySelector<HTMLElement>('.xterm-rows')?.style.letterSpacing).toBe('0.25px');
    expect(node.querySelector<HTMLElement>(':scope .xterm-rows > div')?.style.height).toBe('20px');
  });

  it('drops the injected stylesheets rather than duplicating every rule in them', () => {
    const root = renderedTerminal(SCREEN_BOX);
    const frozen = freezeTerminalScreen(fakeTerminal(root), container(CONTAINER_BOX));
    expect(frozen.node!.querySelectorAll('style')).toHaveLength(0);
    expect(root.querySelectorAll('style')).toHaveLength(1);
  });

  it('stops the cursor blinking, since a still image must not move', () => {
    const root = renderedTerminal(SCREEN_BOX);
    const frozen = freezeTerminalScreen(fakeTerminal(root), container(CONTAINER_BOX));
    expect(frozen.node!.querySelector('.xterm-cursor-blink')).toBeNull();
    expect(frozen.node!.querySelector('.xterm-cursor')?.textContent).toBe('x');
  });

  it('detaches the clone, so the live screen keeps drawing underneath it', () => {
    const root = renderedTerminal(SCREEN_BOX);
    const frozen = freezeTerminalScreen(fakeTerminal(root), container(CONTAINER_BOX));
    expect(frozen.node).not.toBe(root.querySelector('.xterm-screen'));
    expect(frozen.node!.parentElement).toBeNull();
  });

  it('falls back to the container grid when the terminal has not opened', () => {
    const frozen = freezeTerminalScreen(fakeTerminal(), container(CONTAINER_BOX));
    expect(frozen).toEqual({
      node: null, ownerClass: '',
      metrics: { cellWidth: 11.25, cellHeight: 25, offsetLeft: 0, offsetTop: 0 },
    });
  });

  it('falls back when the screen holds no rendered rows to clone', () => {
    const root = document.createElement('div');
    root.innerHTML = '<div class="xterm-screen"><canvas></canvas></div>';
    boxed(root.querySelector('.xterm-screen') as HTMLElement, SCREEN_BOX);
    const frozen = freezeTerminalScreen(fakeTerminal(root), container(CONTAINER_BOX));
    expect(frozen.node).toBeNull();
    expect(frozen.metrics.cellWidth).toBe(11.25);
  });

  it('falls back when the screen box has not been laid out yet', () => {
    const root = renderedTerminal({ left: 0, top: 0, width: 0, height: 0 });
    const frozen = freezeTerminalScreen(fakeTerminal(root), container(CONTAINER_BOX));
    expect(frozen.node).toBeNull();
    expect(frozen.metrics.offsetLeft).toBe(0);
  });
});
