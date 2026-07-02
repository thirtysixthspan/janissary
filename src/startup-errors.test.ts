import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { explainStartupError, formatFatal, maybeStack } from './startup-errors.js';

function errnoError(code: string): NodeJS.ErrnoException {
  const error = new Error(code) as NodeJS.ErrnoException;
  error.code = code;
  return error;
}

describe('explainStartupError', () => {
  it('mentions the port and --port for EADDRINUSE', () => {
    const message = explainStartupError(errnoError('EADDRINUSE'), { port: 4100 });
    expect(message).toContain('4100');
    expect(message).toContain('--port');
  });

  it('mentions elevated privileges for EACCES', () => {
    const message = explainStartupError(errnoError('EACCES'), { port: 80 });
    expect(message).toContain('elevated privileges');
  });

  it('returns null for an unrecognized error', () => {
    expect(explainStartupError(new Error('boom'))).toBeNull();
  });
});

describe('formatFatal', () => {
  it('prefixes the message with the app name and version', () => {
    const packagePath = path.join(import.meta.dirname, '..', 'package.json');
    const pkg = JSON.parse(readFileSync(packagePath, 'utf8')) as { name: string; version: string };
    expect(formatFatal('boom')).toBe(`${pkg.name} ${pkg.version} — failed to start: boom`);
  });
});

describe('maybeStack', () => {
  const originalDebug = process.env.JANUS_DEBUG;

  afterEach(() => {
    if (originalDebug === undefined) delete process.env.JANUS_DEBUG;
    else process.env.JANUS_DEBUG = originalDebug;
  });

  it('is empty when JANUS_DEBUG is unset', () => {
    delete process.env.JANUS_DEBUG;
    expect(maybeStack(new Error('boom'))).toBe('');
  });

  it('includes the stack when JANUS_DEBUG is set', () => {
    process.env.JANUS_DEBUG = '1';
    const error = new Error('boom');
    expect(maybeStack(error)).toContain(error.stack);
  });
});
