import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');
const extDir = path.join(root, 'chrome-extension');

describe('chrome-extension/manifest.json', () => {
  const manifest = JSON.parse(readFileSync(path.join(extDir, 'manifest.json'), 'utf8')) as {
    manifest_version: number;
    permissions: string[];
    host_permissions: string[];
    declarative_net_request: { rule_resources: Array<{ path: string }> };
  };

  it('uses manifest version 3', () => {
    expect(manifest.manifest_version).toBe(3);
  });

  it('declares declarativeNetRequest permission', () => {
    expect(manifest.permissions).toContain('declarativeNetRequest');
  });

  it('declares host_permissions for all URLs', () => {
    expect(manifest.host_permissions).toContain('<all_urls>');
  });

  it('references rules.json as a rule resource', () => {
    const resources = manifest.declarative_net_request?.rule_resources ?? [];
    expect(resources.some((r) => r.path === 'rules.json')).toBe(true);
  });
});

describe('chrome-extension/rules.json', () => {
  type Header = { header: string; operation: string };
  type Rule = { condition: { resourceTypes: string[] }; action: { responseHeaders: Header[] } };
  const rules = JSON.parse(readFileSync(path.join(extDir, 'rules.json'), 'utf8')) as Rule[];

  it('has at least one rule', () => {
    expect(rules.length).toBeGreaterThan(0);
  });

  it('scopes the rule to sub_frame resources only', () => {
    expect(rules[0].condition.resourceTypes).toEqual(['sub_frame']);
  });

  it('removes the x-frame-options header', () => {
    expect(rules[0].action.responseHeaders).toContainEqual({ header: 'x-frame-options', operation: 'remove' });
  });

  it('removes the content-security-policy header', () => {
    expect(rules[0].action.responseHeaders).toContainEqual({ header: 'content-security-policy', operation: 'remove' });
  });
});

describe('src/main.ts launch flags', () => {
  const mainSrc = readFileSync(path.join(import.meta.dirname, 'main.ts'), 'utf8');

  it('passes --load-extension to Chrome', () => {
    expect(mainSrc).toContain('--load-extension=');
  });

  it('passes --disable-extensions-except to Chrome', () => {
    expect(mainSrc).toContain('--disable-extensions-except=');
  });

  it('resolves the extension dir one level above the compiled output', () => {
    expect(mainSrc).toContain("path.join(import.meta.dirname, '..', 'chrome-extension')");
  });
});
