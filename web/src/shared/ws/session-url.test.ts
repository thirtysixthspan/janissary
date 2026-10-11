import { afterEach, describe, expect, it } from 'vitest';
import { resourceUrl, webSocketUrl } from './session-url';

describe('session URL builders', () => {
  afterEach(() => { history.replaceState(null, '', '/'); });

  it('adds the page session token to resource and WebSocket URLs', () => {
    history.replaceState(null, '', '/?token=s3cr3t%2Ftoken');

    expect(resourceUrl('/open/abc')).toBe('/open/abc?token=s3cr3t%2Ftoken');
    expect(webSocketUrl()).toBe(`ws://${location.host}/?token=s3cr3t%2Ftoken`);
  });

  it('sends an empty token parameter when the page has none', () => {
    expect(resourceUrl('/open/abc')).toBe('/open/abc?token=');
  });
});
