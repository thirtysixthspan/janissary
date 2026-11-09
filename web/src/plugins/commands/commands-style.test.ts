import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import commands from './commands.css?raw';

const entry = readFileSync('web/src/plugins/commands/index.tsx', 'utf8');

describe('commands stylesheet', () => {
  it('loads the shared and plugin stylesheets from the entry', () => {
    expect(entry).toContain("import '../shared.css'");
    expect(entry).toContain("import './commands.css'");
  });

  it('scopes every selector to commands-', () => {
    const selectors = [...commands.replaceAll(/\/\*[\s\S]*?\*\//gu, '').matchAll(/([^{}]+)\{/gu)]
      .flatMap((match) => match[1].split(','))
      .map((selector) => selector.trim())
      .filter((selector) => selector.length > 0);

    expect(selectors.length).toBeGreaterThan(0);
    for (const selector of selectors) expect(selector.startsWith('.commands-')).toBe(true);
  });

  it('scrolls the grid horizontally with a minimum width and no docked branch', () => {
    expect(commands).toContain('.commands-scroll { overflow-x: auto; }');
    expect(commands).toMatch(/\.commands-grid \{[^}]*min-width: [^;]+;/u);
    expect(commands).not.toContain('commands-tab-narrow');
    expect(commands).not.toContain('dock');
  });

  it('follows the Models row and header spacing, hover, muted color, and theme variables', () => {
    const rule = commands.match(/\.commands-columns, \.commands-row \{[^}]+\}/u)?.[0];

    expect(rule).toBeDefined();
    expect(rule).toContain('gap: 12px');
    expect(rule).toContain('padding: 0 12px');
    expect(rule).toContain('font-size: 12px');
    expect(rule).toContain('color: var(--muted)');
    expect(commands).toContain('.commands-row:hover { background: var(--border); }');
    expect(commands).toContain('.commands-row-disabled { color: var(--muted); opacity: 0.65; }');
    expect(commands).toContain('var(--fg)');
    expect(commands).toContain('var(--danger)');
  });
});
