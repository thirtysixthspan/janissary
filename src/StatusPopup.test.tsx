import { describe, it, expect } from 'vitest';
import { statusLines } from './StatusPopup.js';
import { darkTheme } from './theme.js';

const texts = (p: Parameters<typeof statusLines>[0]) => statusLines(p).map((l) => l.text);

describe('statusLines', () => {
  it('lists open SQLite connections this tab has accessed', () => {
    expect(texts({ cwd: '/tmp', dbConnections: ['movies', 'shop'], theme: darkTheme })).toEqual([
      'sqlite:movies',
      'sqlite:shop',
    ]);
  });

  it('shows the shell, agent, and db connections together', () => {
    expect(
      texts({
        shell: '/bin/bash',
        cwd: '/tmp',
        provider: 'opencode',
        dbConnections: ['movies'],
        theme: darkTheme,
      }),
    ).toEqual(['bash:/tmp', 'acp:opencode', 'sqlite:movies']);
  });

  it('renders no db lines when there are none', () => {
    expect(texts({ shell: '/bin/bash', cwd: '/tmp', theme: darkTheme })).toEqual(['bash:/tmp']);
  });
});
