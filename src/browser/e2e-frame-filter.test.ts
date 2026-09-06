import { describe, it, expect } from 'vitest';
import { inspectClientFrame, inspectServerFrame, isFileUrl } from './e2e-frame-filter.js';

// The matching rules on their own. `e2e-guard.test.ts` covers the same decisions end to end over
// two real sockets; these cover the shapes that are awkward to construct through a socket — deep
// nesting, unusual scheme spellings, non-object JSON.

describe('isFileUrl', () => {
  it.each([
    'file:///etc/passwd',
    'FILE:///etc/passwd',
    'File:///etc/passwd',
    // Leading control characters and spaces are stripped by every URL parser before the scheme is
    // read, so a padded scheme names the same URL to the browser as the bare form.
    '  file:///etc/passwd',
    '\n\tfile:///etc/passwd',
    '\0file:///etc/passwd',
    // No host, no path: still the file scheme.
    'file:',
    // The parser removes every ASCII tab and newline from the whole input before it reads anything,
    // so one *inside* the scheme normalizes away. None of these carries leading padding, so the
    // trim the guard used to do on its own leaves a scheme that is not `file` and relays the frame.
    'fi\tle:///etc/passwd',
    'f\nile:///etc/passwd',
    'fil\re:///etc/passwd',
    'file\t:///etc/passwd',
    '\n  fi\tle:///etc/passwd',
    'F\tI\nL\rE:///etc/passwd',
  ])('treats %j as a file URL', (value) => {
    expect(isFileUrl(value)).toBe(true);
  });

  it.each([
    'https://example.com/',
    'http://127.0.0.1:3000/app',
    'data:text/html,<h1>hi</h1>',
    'about:blank',
    // The characters `file://` appearing inside a URL of another scheme is not a file URL.
    'https://example.com/?next=file:///etc/passwd',
    'notfile:///etc/passwd',
    '/etc/passwd',
    '',
    // The normalization removes tabs and newlines; it does not make anything else into `file`.
    // Removing them from another scheme leaves that scheme, and cannot introduce a colon.
    'ht\ttps://example.com/',
    'abo\nut:blank',
    'not\tfile:///etc/passwd',
    'profile:///etc/passwd',
    'a file\tname\twith\ttabs',
  ])('does not treat %j as a file URL', (value) => {
    expect(isFileUrl(value)).toBe(false);
  });
});

describe('inspectClientFrame', () => {
  it('allows an ordinary navigation', () => {
    const frame = JSON.stringify({ id: 1, method: 'Page.navigate', params: { url: 'https://example.com/' } });
    expect(inspectClientFrame(frame)).toEqual({ blocked: false });
  });

  it('blocks a file: URL in any string position, not only a url field', () => {
    for (const params of [
      { url: 'file:///etc/passwd' },
      { href: 'file:///etc/passwd' },
      { anything: { deeply: { nested: 'file:///etc/passwd' } } },
      { urls: ['https://ok.example', 'file:///etc/passwd'] },
    ]) {
      const frame = JSON.stringify({ id: 1, method: 'Page.navigate', params });
      expect(inspectClientFrame(frame)).toMatchObject({ blocked: true });
    }
  });

  it('blocks a file: URL whose scheme is split by a tab', () => {
    const frame = JSON.stringify({ id: 1, method: 'Page.navigate', params: { url: 'fi\tle:///etc/passwd' } });
    expect(inspectClientFrame(frame)).toMatchObject({ blocked: true, reason: 'file: URL blocked' });
  });

  it('blocks a frame that is not valid JSON', () => {
    expect(inspectClientFrame('not json')).toMatchObject({ blocked: true, reason: 'unreadable protocol frame' });
    expect(inspectClientFrame('')).toMatchObject({ blocked: true });
  });

  // A bare scalar parses but is not a protocol message, so it fails closed with the frames that do
  // not parse at all rather than relaying as "nothing to object to".
  it.each(['null', 'true', '42', '"a string"'])('blocks the non-object JSON frame %s', (frame) => {
    expect(inspectClientFrame(frame)).toMatchObject({ blocked: true, reason: 'unreadable protocol frame' });
  });

  it('allows a deeply nested frame with no file: URL anywhere', () => {
    const frame = JSON.stringify({ a: { b: [{ c: ['https://x.example', { d: 'about:blank' }] }] } });
    expect(inspectClientFrame(frame)).toEqual({ blocked: false });
  });
});

// The browser belongs to the tab, and the guest driving it does not get to end it. Playwright's own
// guids are type-prefixed, which is what makes the object a frame addresses readable from the frame
// alone — `browser@` is the browser and nothing else wears that prefix.
describe('inspectClientFrame on a teardown request', () => {
  it.each(['close', 'killForTests'])('blocks %s addressed to the browser', (method) => {
    const frame = JSON.stringify({ id: 7, guid: 'browser@3f2a91c4', method, params: {} });
    expect(inspectClientFrame(frame)).toMatchObject({ blocked: true, reason: 'browser teardown blocked' });
  });

  // Closing a context is ordinary work — every script does it between shots — and its guid shares
  // the first seven characters with the browser's. This is the case a prefix match gets wrong.
  it('allows close addressed to a browser context', () => {
    const frame = JSON.stringify({ id: 8, guid: 'browser-context@3f2a91c4', method: 'close', params: {} });
    expect(inspectClientFrame(frame)).toEqual({ blocked: false });
  });

  it.each(['page@3f2a91c4', 'frame@3f2a91c4', 'browser-type@3f2a91c4'])('allows close addressed to %s', (guid) => {
    const frame = JSON.stringify({ id: 9, guid, method: 'close', params: {} });
    expect(inspectClientFrame(frame)).toEqual({ blocked: false });
  });

  it('allows every other method on the browser itself', () => {
    for (const method of ['newContext', 'newPage', 'version', 'newBrowserCDPSession']) {
      const frame = JSON.stringify({ id: 10, guid: 'browser@3f2a91c4', method, params: {} });
      expect(inspectClientFrame(frame)).toEqual({ blocked: false });
    }
  });

  // The rule fires on an attributed request, not on the word `close` appearing in a frame.
  it('allows a close method on a frame that names no object', () => {
    expect(inspectClientFrame(JSON.stringify({ id: 11, method: 'close' }))).toEqual({ blocked: false });
  });

  it('still blocks a file: URL carried on a browser frame that is not a teardown', () => {
    const frame = JSON.stringify({ guid: 'browser@3f2a91c4', method: 'newPage', params: { url: 'file:///etc/passwd' } });
    expect(inspectClientFrame(frame)).toMatchObject({ blocked: true, reason: 'file: URL blocked' });
  });
});

describe('inspectServerFrame', () => {
  it('allows page content that merely mentions file://', () => {
    const frame = JSON.stringify({ id: 1, result: { value: 'see file:///etc/hosts for details' } });
    expect(inspectServerFrame(frame)).toEqual({ blocked: false });
  });

  it.each(['url', 'documentURL'])('blocks a navigation result reported in %s', (key) => {
    const frame = JSON.stringify({ id: 1, result: { [key]: 'file:///etc/passwd' } });
    expect(inspectServerFrame(frame)).toMatchObject({ blocked: true, reason: 'file: URL blocked' });
  });

  it('blocks a file: URL on any node of a frame tree', () => {
    const frame = JSON.stringify({
      method: 'Page.frameTree',
      params: { frameTree: { frame: { url: 'https://ok.example' }, childFrames: [{ frame: { url: 'file:///etc/passwd' } }] } },
    });
    expect(inspectServerFrame(frame)).toMatchObject({ blocked: true });
  });

  it('blocks a navigation result whose scheme is split by a newline', () => {
    const frame = JSON.stringify({ id: 1, result: { documentURL: 'fi\nle:///etc/passwd' } });
    expect(inspectServerFrame(frame)).toMatchObject({ blocked: true, reason: 'file: URL blocked' });
  });

  it('blocks an unreadable frame on the way back too', () => {
    expect(inspectServerFrame('<not json>')).toMatchObject({ blocked: true, reason: 'unreadable protocol frame' });
  });

  it('allows an ordinary navigation result', () => {
    const frame = JSON.stringify({ id: 1, result: { url: 'https://example.com/', documentURL: 'https://example.com/' } });
    expect(inspectServerFrame(frame)).toEqual({ blocked: false });
  });

  // The browser reports its own death as a `close` event under the same guid and method a teardown
  // request uses, so the rule is one-directional on purpose. A client that is never told its browser
  // died is worse off than one that is.
  it('relays the browser\'s own close event back to the client', () => {
    const frame = JSON.stringify({ guid: 'browser@3f2a91c4', method: 'close', params: {} });
    expect(inspectServerFrame(frame)).toEqual({ blocked: false });
  });
});
