import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Guards the bundled declarativeNetRequest extension `src/main.ts`'s `openApp` launches Chrome
// with (`--load-extension`/`--disable-extensions-except`) — these are plain static config files,
// not covered by any other test, so their accidental deletion previously went unnoticed.
const extensionDir = path.join(import.meta.dirname, '..', 'chrome-extension');

type Manifest = {
  manifest_version: number;
  permissions: string[];
  declarative_net_request: { rule_resources: { path: string }[] };
  content_scripts: { matches: string[]; all_frames: boolean; js: string[] }[];
};

type Rule = {
  condition: { resourceTypes: string[] };
  action: { responseHeaders: { header: string; operation: string }[] };
};

describe('chrome-extension', () => {
  it('manifest.json declares the declarativeNetRequest rule set', () => {
    const manifest = JSON.parse(readFileSync(path.join(extensionDir, 'manifest.json'), 'utf8')) as Manifest;
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.permissions).toContain('declarativeNetRequest');
    expect(manifest.declarative_net_request.rule_resources[0]?.path).toBe('rules.json');
  });

  it('rules.json strips framing headers from sub-frame responses', () => {
    const rules = JSON.parse(readFileSync(path.join(extensionDir, 'rules.json'), 'utf8')) as Rule[];
    expect(rules.length).toBeGreaterThan(0);
    const [rule] = rules;
    expect(rule.condition.resourceTypes).toContain('sub_frame');
    const headers = rule.action.responseHeaders.map((h) => h.header);
    expect(headers).toContain('x-frame-options');
    expect(headers).toContain('content-security-policy');
  });

  it('package.json ships the extension directory', () => {
    const pkg = JSON.parse(readFileSync(path.join(extensionDir, '..', 'package.json'), 'utf8')) as { files: string[] };
    expect(pkg.files).toContain('chrome-extension');
  });

  it('manifest.json declares a content script matching every URL, in every frame', () => {
    const manifest = JSON.parse(readFileSync(path.join(extensionDir, 'manifest.json'), 'utf8')) as Manifest;
    const [contentScript] = manifest.content_scripts;
    expect(contentScript.matches).toContain('<all_urls>');
    expect(contentScript.all_frames).toBe(true);
    expect(contentScript.js).toContain('content-script.js');
  });

  it('content-script.js exists and only acts inside a nested frame', () => {
    const script = readFileSync(path.join(extensionDir, 'content-script.js'), 'utf8');
    expect(script).toContain('window.top === window.self');
  });
});
