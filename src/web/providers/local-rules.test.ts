import { describe, expect, it } from 'vitest';
import { ProviderRequestError } from './contract.js';
import { acceptedContentType, decodeBody, upgradedUrl } from './local-rules.js';

const http = (value: string) => `http:${value}`;

const upgraded = [
  http('//example.com/'),
  'http://172.32.0.1/',
  'http://8.8.8.8/',
  'http://[2001:db8::1]/',
  http('//example.com./'),
];

const kept = [
  'http://localhost:3000/',
  http('//app.localhost/'),
  'http://LOCALHOST/',
  'http://localhost./',
  'http://intranet/',
  'http://intranet./',
  'http://127.0.0.1/',
  'http://2130706433/',
  'http://10.1.2.3/',
  'http://172.16.0.1/',
  'http://172.31.255.255/',
  'http://192.168.1.1/',
  'http://169.254.169.254/',
  'http://[::1]/',
  'http://[fd00::1]/',
  'http://[fe80::1]/',
  'http://[::ffff:192.168.1.1]/',
];

describe('upgradedUrl', () => {
  it.each(upgraded)('upgrades %s to https', (value) => {
    expect(upgradedUrl(new URL(value)).protocol).toBe('https:');
  });

  it.each(kept)('keeps %s as http', (value) => {
    expect(upgradedUrl(new URL(value)).protocol).toBe('http:');
  });

  it('leaves https URLs unchanged', () => {
    for (const value of ['https://localhost/', 'https://example.com/']) {
      expect(upgradedUrl(new URL(value)).href).toBe(value);
    }
  });

  it('preserves port, path, query, and fragment', () => {
    expect(upgradedUrl(new URL(http('//example.com:8080/a?b#c'))).href).toBe('https://example.com:8080/a?b#c');
  });

  it('does not mutate the argument and returns a new URL', () => {
    const input = new URL(http('//example.com/'));
    const result = upgradedUrl(input);
    expect(result).not.toBe(input);
    expect(input.protocol).toBe('http:');
    expect(result.protocol).toBe('https:');
  });
});

describe('acceptedContentType', () => {
  it.each([
    ['text/html; charset=utf-8', 'text/html'],
    ['TEXT/PLAIN', 'text/plain'],
    [' text/csv ; x=y', 'text/csv'],
    ['application/xhtml+xml', 'application/xhtml+xml'],
    ['application/json', 'application/json'],
    ['application/ld+json', 'application/ld+json'],
    ['application/xml', 'application/xml'],
    ['image/svg+xml', 'image/svg+xml'],
  ])('accepts %s as %s', (header, expected) => {
    expect(acceptedContentType(header)).toBe(expected);
  });

  it.each([
    ['Application/PDF; x=y', 'unsupported content type application/pdf'],
    ['image/png', 'unsupported content type image/png'],
    ['video/mp4', 'unsupported content type video/mp4'],
    ['application/octet-stream', 'unsupported content type application/octet-stream'],
    [null, 'unsupported content type application/octet-stream'],
    ['', 'unsupported content type application/octet-stream'],
  ])('refuses %s', (header, reason) => {
    expect(() => acceptedContentType(header)).toThrowError(ProviderRequestError);
    expect(() => acceptedContentType(header)).toThrow(reason);
  });
});

describe('decodeBody', () => {
  const text = (value: string) => new TextEncoder().encode(value);

  it('decodes as UTF-8 for a null header', () => {
    expect(decodeBody(text('héllo'), null)).toBe('héllo');
  });

  it('decodes as UTF-8 when there is no charset parameter', () => {
    expect(decodeBody(text('héllo'), 'text/plain')).toBe('héllo');
  });

  it('decodes as UTF-8 for an empty charset value', () => {
    expect(decodeBody(text('héllo'), 'text/plain; charset=')).toBe('héllo');
  });

  it('honors an ISO-8859-1 declaration', () => {
    expect(decodeBody(new Uint8Array([0xe9]), 'text/plain; charset=ISO-8859-1')).toBe('é');
  });

  it('strips quotes around a charset value', () => {
    expect(decodeBody(new Uint8Array([0x80]), 'text/plain; charset="windows-1252"')).toBe('€');
  });

  it('reads the charset parameter case-insensitively', () => {
    expect(decodeBody(text('héllo'), 'text/plain; CHARSET=utf-8')).toBe('héllo');
  });

  it('falls back to UTF-8 for a rejected label', () => {
    expect(decodeBody(text('héllo'), 'text/plain; charset=x-unknown')).toBe('héllo');
    expect(decodeBody(text('héllo'), 'text/plain; charset=iso-2022-kr')).toBe('héllo');
  });

  it('replaces invalid UTF-8 bytes', () => {
    expect(decodeBody(new Uint8Array([0xff]), 'text/plain')).toBe('\u{FFFD}');
  });

  it('drops one leading BOM', () => {
    expect(decodeBody(text('\u{FEFF}hi'), 'text/plain; charset=utf-8')).toBe('hi');
  });
});
