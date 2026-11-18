import { describe, expect, it } from 'vitest';
import { parseRemoteAddress } from '../../remote/address.js';
import {
  decodeHosts, formatDestination, isHostName, sameHostName, validateHostFields,
} from './hosts-values.js';

describe('isHostName', () => {
  it('accepts letters, digits, dots, hyphens and underscores', () => {
    expect(isHostName('Dev_Box-1.example')).toBe(true);
  });

  it('rejects separators, whitespace and characters outside the alphabet', () => {
    for (const value of ['', 'a b', 'user@host', 'a:b', '/srv', '~', 'é']) {
      expect(isHostName(value)).toBe(false);
    }
  });
});

describe('validating one host', () => {
  it('keeps only the name and host when optional fields are absent', () => {
    expect(validateHostFields('devbox', undefined, '10.0.0.5', undefined)).toEqual({
      ok: true, host: { name: 'devbox', host: '10.0.0.5' },
    });
  });

  it('keeps a saved user, port and path', () => {
    expect(validateHostFields('DevBox', 'admin', 'box.example:2222', '/srv/proj')).toEqual({
      ok: true,
      host: { name: 'DevBox', host: 'box.example', user: 'admin', port: 2222, path: '/srv/proj' },
    });
  });

  it('treats omitted and whitespace-only optional strings as absent', () => {
    expect(validateHostFields('devbox', ' '.repeat(3), 'host', '\t \n')).toEqual({
      ok: true, host: { name: 'devbox', host: 'host' },
    });
  });

  it('rejects explicit non-string optional values, including null', () => {
    expect(validateHostFields('devbox', null, 'host', undefined)).toEqual({
      ok: false, error: 'Invalid user "null". Use letters, digits, and . - _ only.',
    });
    expect(validateHostFields('devbox', undefined, 'host', 42)).toEqual({
      ok: false, error: 'Invalid path "42". Use letters, digits, and . - _ / ~ only.',
    });
    expect(validateHostFields('devbox', {}, 'host', undefined).ok).toBe(false);
    expect(validateHostFields('devbox', undefined, 'host', true).ok).toBe(false);
  });

  it('applies the field rules to the whole value without trimming', () => {
    expect(validateHostFields(' dev ', undefined, 'host', undefined)).toEqual({
      ok: false, error: 'Invalid name " dev ". Use letters, digits, and . - _ only.',
    });
    expect(validateHostFields('devbox', undefined, 'host', ' /srv ').ok).toBe(false);
  });

  it('accepts the lowest and highest ports', () => {
    expect(validateHostFields('a', undefined, 'host:1', undefined)).toMatchObject({ ok: true, host: { port: 1 } });
    expect(validateHostFields('a', undefined, 'host:65535', undefined)).toMatchObject({
      ok: true, host: { port: 65_535 },
    });
  });

  it('rejects ports outside the range', () => {
    for (const value of ['host:0', 'host:65536', 'host:999999999999999999999']) {
      expect(validateHostFields('a', undefined, value, undefined)).toEqual({
        ok: false,
        error: `Invalid port "${value.slice(value.indexOf(':') + 1)}". Use digits only, from 1 to 65535.`,
      });
    }
  });

  it('rejects blank and non-digit ports, including a second colon', () => {
    expect(validateHostFields('a', undefined, 'host:', undefined)).toEqual({
      ok: false, error: 'Invalid port "". Use digits only, from 1 to 65535.',
    });
    expect(validateHostFields('a', undefined, 'host:22:33', undefined)).toEqual({
      ok: false, error: 'Invalid port "22:33". Use digits only, from 1 to 65535.',
    });
    expect(validateHostFields('a', undefined, 'host:abc', undefined)).toEqual({
      ok: false, error: 'Invalid port "abc". Use digits only, from 1 to 65535.',
    });
    expect(validateHostFields('a', undefined, 'host: 22', undefined).ok).toBe(false);
  });

  it('requires a non-empty bare host', () => {
    expect(validateHostFields('a', undefined, ':22', undefined)).toEqual({
      ok: false, error: 'Invalid host "". Use letters, digits, and . - _ only.',
    });
    expect(validateHostFields('a', undefined, '', undefined).ok).toBe(false);
  });

  it('rejects bad characters in the host and user', () => {
    expect(validateHostFields('a', undefined, 'bad@host', undefined)).toEqual({
      ok: false, error: 'Invalid host "bad@host". Use letters, digits, and . - _ only.',
    });
    expect(validateHostFields('a', 'bad user', 'host', undefined)).toEqual({
      ok: false, error: 'Invalid user "bad user". Use letters, digits, and . - _ only.',
    });
  });

  it('allows slash and tilde in a path but not in a host', () => {
    expect(validateHostFields('a', undefined, 'host', '~/srv/proj')).toMatchObject({ ok: true });
    expect(validateHostFields('a', undefined, '~/srv', undefined).ok).toBe(false);
  });

  it('reports a missing destination', () => {
    expect(validateHostFields('a', undefined, undefined, undefined)).toEqual({
      ok: false, error: 'Missing destination.',
    });
    expect(validateHostFields('a', undefined, null, undefined).ok).toBe(false);
  });
});

describe('decoding a catalog', () => {
  it('treats an empty object as a valid empty catalog', () => {
    expect(decodeHosts({})).toEqual({ ok: true, hosts: [] });
  });

  it('returns rows with display spelling, sorted by folded name', () => {
    expect(decodeHosts({
      zulu: { destination: 'z.example' },
      Alpha: { destination: 'a.example' },
      beta: { destination: 'b.example', path: '/srv' },
    })).toEqual({
      ok: true,
      hosts: [
        { name: 'Alpha', host: 'a.example' },
        { name: 'beta', host: 'b.example', path: '/srv' },
        { name: 'zulu', host: 'z.example' },
      ],
    });
  });

  it('decodes a mixed-case scratch object with a port and a path', () => {
    expect(decodeHosts({
      DevBox: { user: 'admin', destination: 'box.example:2222', path: '~/proj' },
      gateway: { destination: '10.0.0.1' },
    })).toEqual({
      ok: true,
      hosts: [
        { name: 'DevBox', host: 'box.example', user: 'admin', port: 2222, path: '~/proj' },
        { name: 'gateway', host: '10.0.0.1' },
      ],
    });
  });

  it('rejects a non-object catalog and non-object entries', () => {
    for (const bad of [null, undefined, [], 'hosts', 7]) {
      expect(decodeHosts(bad)).toEqual({ ok: false, error: 'Hosts catalog is not an object.' });
    }
    expect(decodeHosts({ devbox: null })).toEqual({ ok: false, error: 'Host "devbox" is not an object.' });
    expect(decodeHosts({ devbox: [] }).ok).toBe(false);
  });

  it('rejects an entry missing its destination', () => {
    expect(decodeHosts({ devbox: { user: 'admin' } })).toEqual({ ok: false, error: 'Missing destination.' });
  });

  it('rejects an entry with an invalid field', () => {
    expect(decodeHosts({ devbox: { destination: 'bad@host' } })).toEqual({
      ok: false, error: 'Invalid host "bad@host". Use letters, digits, and . - _ only.',
    });
  });

  it('rejects case-insensitive duplicate names', () => {
    expect(decodeHosts({ DevBox: { destination: 'a' }, devbox: { destination: 'b' } })).toEqual({
      ok: false, error: 'Duplicate host name "devbox".',
    });
  });

  it('handles a special name key like any other saved name', () => {
    const catalog = JSON.parse('{"__proto__":{"destination":"host"},"alpha":{"destination":"other"}}') as unknown;
    expect(decodeHosts(catalog)).toEqual({
      ok: true,
      hosts: [
        { name: '__proto__', host: 'host' },
        { name: 'alpha', host: 'other' },
      ],
    });
  });
});

describe('host formatting and equality', () => {
  it('formats a host with and without a port', () => {
    expect(formatDestination({ name: 'a', host: 'box.example' })).toBe('box.example');
    expect(formatDestination({ name: 'a', host: 'box.example', port: 2222 })).toBe('box.example:2222');
  });

  it('compares names without regard to case', () => {
    expect(sameHostName('DevBox', 'devbox')).toBe(true);
    expect(sameHostName('DevBox', 'other')).toBe(false);
  });
});

describe('parity with the on-address parser', () => {
  const corpus = ['a', 'Z', '7', '_', '.', '-', '@', ':', '/', '~', '+', '%', ' ', '\t', 'é', '☃', '!', '$'];

  it('accepts and rejects the same host characters, apart from the parser separators', () => {
    for (const value of corpus) {
      if (value === '@' || value === ':' || value.trim().length === 0) continue;
      const parsed = parseRemoteAddress(value);
      const validated = validateHostFields('devbox', undefined, value, undefined);
      expect(validated.ok, `host ${JSON.stringify(value)}`).toBe(!('error' in parsed));
    }
  });

  it('accepts and rejects the same user characters, apart from the parser separators', () => {
    for (const value of corpus) {
      if (value === '@' || value === ':' || value.trim().length === 0) continue;
      const parsed = parseRemoteAddress(value);
      const validated = validateHostFields('devbox', value, 'host', undefined);
      expect(validated.ok, `user ${JSON.stringify(value)}`).toBe(!('error' in parsed));
    }
  });

  it('accepts and rejects the same path characters, apart from the parser separator', () => {
    for (const value of corpus) {
      if (value === ':' || value.trim().length === 0) continue;
      const parsed = parseRemoteAddress(`host:${value}`);
      const validated = validateHostFields('devbox', undefined, 'host', value);
      expect(validated.ok, `path ${JSON.stringify(value)}`).toBe(!('error' in parsed));
    }
  });
});
