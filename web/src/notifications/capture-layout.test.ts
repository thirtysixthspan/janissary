import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('notification capture layout', () => {
  it('wraps capture icons within the notification pane without gaps', () => {
    const styles = readFileSync('web/src/theme.css', 'utf8');
    const rule = styles.match(/\.line\.message \.message-files\s*\{([^}]+)\}/)?.[1];
    expect(rule).toContain('flex-wrap: wrap');
    expect(rule).toContain('min-width: 0');
    expect(rule).toContain('max-width: 100%');
    expect(rule).not.toMatch(/gap\s*:/);
  });
});
