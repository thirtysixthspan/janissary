import { describe, it, expect } from 'vitest';
import { extendRunout, trimRunout } from './find-runout';

// A 400px-tall body over 1000px of rows, with the run-out after them counted in its scroll height
// the way a browser lays it out.
function makeBody(clientHeight = 400, contentHeight = 1000): { body: HTMLElement; runout: HTMLElement } {
  const body = document.createElement('div');
  const runout = document.createElement('div');
  body.append(runout);
  Object.defineProperties(body, {
    clientHeight: { value: clientHeight },
    scrollHeight: { get: () => contentHeight + (Number(runout.style.height.replace('px', '')) || 0) },
  });
  return { body, runout };
}

describe('extendRunout', () => {
  it('grows the run-out by how far the offset lies past the end of the content', () => {
    const { body, runout } = makeBody();

    extendRunout(body, runout, 750);

    expect(runout.style.height).toBe('150px');
  });

  it('adds to a run-out that is already there', () => {
    const { body, runout } = makeBody();
    runout.style.height = '100px';

    extendRunout(body, runout, 750);

    expect(runout.style.height).toBe('150px');
  });

  it('leaves the run-out empty when the content already reaches the offset', () => {
    const { body, runout } = makeBody();

    extendRunout(body, runout, 600);

    expect(runout.style.height).toBe('');
  });
});

describe('trimRunout', () => {
  it('shrinks the run-out to the part the view still reaches into', () => {
    const { body, runout } = makeBody();
    runout.style.height = '150px';
    body.scrollTop = 650;

    trimRunout(body, runout);

    expect(runout.style.height).toBe('50px');
  });

  it('clears the run-out once the view no longer reaches past the content', () => {
    const { body, runout } = makeBody();
    runout.style.height = '150px';
    body.scrollTop = 500;

    trimRunout(body, runout);

    expect(runout.style.height).toBe('');
  });

  it('keeps the whole run-out while the view sits at its bottom', () => {
    const { body, runout } = makeBody();
    runout.style.height = '150px';
    body.scrollTop = 750;

    trimRunout(body, runout);

    expect(runout.style.height).toBe('150px');
  });

  it('leaves the run-out alone while the body reports no height', () => {
    const { body, runout } = makeBody(0);
    runout.style.height = '150px';

    trimRunout(body, runout);

    expect(runout.style.height).toBe('150px');
  });
});
