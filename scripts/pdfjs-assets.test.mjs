import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pdfjsAssetMiddleware } from '../web/pdfjs-assets.ts';

let fixture;
let packageRoot;

beforeEach(() => {
  mkdirSync('temp', { recursive: true });
  fixture = mkdtempSync(path.resolve('temp/pdfjs-assets-'));
  packageRoot = path.join(fixture, 'package');
  mkdirSync(path.join(packageRoot, 'cmaps'), { recursive: true });
  mkdirSync(path.join(packageRoot, 'standard_fonts'));
  writeFileSync(path.join(packageRoot, 'cmaps', 'UniJIS-UTF16-H.bcmap'), 'map bytes');
  writeFileSync(path.join(packageRoot, 'standard_fonts', 'font.ttf'), 'font bytes');
});

afterEach(() => { rmSync(fixture, { recursive: true, force: true }); });

function request(url, root = packageRoot) {
  const response = { setHeader: vi.fn(), end: vi.fn() };
  const next = vi.fn();
  pdfjsAssetMiddleware(root)({ url }, response, next);
  return { response, next };
}

describe('development PDF assets', () => {
  it.each([
    ['/pdfjs/cmaps/UniJIS-UTF16-H.bcmap', 'map bytes', 'application/octet-stream'],
    ['/pdfjs/standard_fonts/font.ttf', 'font bytes', 'font/ttf'],
  ])('serves %s with its content type', (url, content, contentType) => {
    const { response, next } = request(url);
    expect(response.setHeader).toHaveBeenCalledWith('Content-Type', contentType);
    expect(response.end).toHaveBeenCalledWith(Buffer.from(content));
    expect(next).not.toHaveBeenCalled();
  });

  it.each([
    '/other', undefined, '/pdfjs/cmaps/.', '/pdfjs/cmaps/..',
    '/pdfjs/cmaps/../package.json', '/pdfjs/cmaps/%2e%2e', '/pdfjs/cmaps/missing.bcmap',
  ])('falls through for %s', (url) => {
    const { response, next } = request(url);
    expect(next).toHaveBeenCalledTimes(1);
    expect(response.end).not.toHaveBeenCalled();
    expect(response.setHeader).not.toHaveBeenCalled();
  });

  it('falls through when reading an asset fails', () => {
    mkdirSync(path.join(packageRoot, 'cmaps', 'directory.bcmap'));
    const { response, next } = request('/pdfjs/cmaps/directory.bcmap');
    expect(next).toHaveBeenCalledTimes(1);
    expect(response.end).not.toHaveBeenCalled();
  });

  it('refuses a symlink escape into a sibling with the same path prefix', () => {
    const outside = path.join(fixture, 'package-other');
    mkdirSync(outside);
    writeFileSync(path.join(outside, 'private.bcmap'), 'private');
    symlinkSync(path.join(outside, 'private.bcmap'), path.join(packageRoot, 'cmaps', 'escape.bcmap'));
    const { response, next } = request('/pdfjs/cmaps/escape.bcmap');
    expect(next).toHaveBeenCalledTimes(1);
    expect(response.end).not.toHaveBeenCalled();
  });

  it('serves a package installed through a symlink', () => {
    const linked = path.join(fixture, 'linked-package');
    symlinkSync(packageRoot, linked, 'dir');
    const { response, next } = request('/pdfjs/cmaps/UniJIS-UTF16-H.bcmap', linked);
    expect(response.end).toHaveBeenCalledWith(Buffer.from('map bytes'));
    expect(next).not.toHaveBeenCalled();
  });
});
