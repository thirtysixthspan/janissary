import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FIXTURES, png, quadrantAt, writeFixtures } from './fixtures.mjs';
import { attachedBrowserFromEnv, readAppUrl } from './session.mjs';

const ENDPOINT = 'ws://127.0.0.1:41234/secret';
const CLIENT_PATH = '/app/node_modules/playwright/index.js';

let scratch = '';

beforeEach(() => { scratch = mkdtempSync(path.join(tmpdir(), 'janus-e2e-')); });
afterEach(() => rmSync(scratch, { recursive: true, force: true }));

const logWith = (...lines) => {
  const file = path.join(scratch, 'server.log');
  writeFileSync(file, `${lines.join('\n')}\n`);
  return file;
};

describe('attachedBrowserFromEnv', () => {
  it('reads the endpoint and client path janissary published', () => {
    expect(attachedBrowserFromEnv({
      JANISSARY_BROWSER_WS_ENDPOINT: ENDPOINT,
      JANISSARY_PLAYWRIGHT: CLIENT_PATH,
    })).toEqual({ endpoint: ENDPOINT, clientPath: CLIENT_PATH });
  });

  it('refuses rather than looking for a browser of its own when either variable is missing', () => {
    expect(() => attachedBrowserFromEnv({ JANISSARY_PLAYWRIGHT: CLIENT_PATH })).toThrow(/-b/);
    expect(() => attachedBrowserFromEnv({ JANISSARY_BROWSER_WS_ENDPOINT: ENDPOINT })).toThrow(/-b/);
    expect(() => attachedBrowserFromEnv({})).toThrow(/JANISSARY_BROWSER_WS_ENDPOINT/);
  });
});

describe('readAppUrl', () => {
  it('reads the address the launcher printed', () => {
    const log = logWith('__JANUS_URL__ http://127.0.0.1:59400/?token=abc');
    expect(readAppUrl(log)).toBe('http://127.0.0.1:59400/?token=abc');
  });

  it('reads the latest line, so a restarted app is addressed rather than the instance before it', () => {
    const log = logWith(
      '__JANUS_URL__ http://127.0.0.1:59400/?token=first',
      '',
      'Janissary is running at:',
      '__JANUS_URL__ http://127.0.0.1:60243/?token=second',
    );
    expect(readAppUrl(log)).toBe('http://127.0.0.1:60243/?token=second');
  });

  it('says so when the app never printed one, rather than handing back undefined', () => {
    expect(() => readAppUrl(logWith('Janissary is running at:'))).toThrow(/is the app running\?/);
  });
});

describe('the image fixtures', () => {
  it('writes every fixture it advertises', () => {
    const directory = path.join(scratch, 'work');
    expect(writeFixtures(directory)).toEqual(Object.keys(FIXTURES));
    for (const name of Object.keys(FIXTURES)) {
      expect(readFileSync(path.join(directory, name)).length).toBeGreaterThan(0);
    }
  });

  it('writes a PNG a browser will decode, at the size and shape it claims', () => {
    const bytes = png(480, 240);
    expect([...bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(bytes.subarray(12, 16).toString('ascii')).toBe('IHDR');
    expect(bytes.readUInt32BE(16)).toBe(480);
    expect(bytes.readUInt32BE(20)).toBe(240);
    expect(bytes.subarray(-8, -4).toString('ascii')).toBe('IEND');
  });

  it('colours the four quadrants differently, so a flip or a rotation is told apart', () => {
    const width = 480;
    const height = 240;
    const corners = [
      quadrantAt(0, 0, width, height),
      quadrantAt(width - 1, 0, width, height),
      quadrantAt(0, height - 1, width, height),
      quadrantAt(width - 1, height - 1, width, height),
    ];
    expect(new Set(corners.map((corner) => corner.join(','))).size).toBe(4);
  });
});
