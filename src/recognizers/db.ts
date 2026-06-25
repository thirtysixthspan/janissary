import type { CommandRecognizer } from './types.js';

// Statement keywords that, when they lead the line, mark a SQL query.
const SQL_START = new Set([
  'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP', 'ALTER', 'WITH', 'PRAGMA',
  'EXPLAIN', 'VACUUM', 'ATTACH', 'DETACH', 'REPLACE', 'BEGIN', 'COMMIT', 'ROLLBACK', 'TRUNCATE',
]);

// Secondary keywords that reinforce a SQL match when present anywhere in the statement.
const SQL_KEYWORDS = ['FROM', 'WHERE', 'JOIN', 'INTO', 'VALUES', 'SET', 'TABLE', 'GROUP BY', 'ORDER BY', 'LIMIT'];

// Recognize a SQL/db query. Gated on the tab having an open database connection — without one
// there is nothing to run the query against, so the route is not offered (per design).
export const dbRecognizer: CommandRecognizer = {
  route: 'db',
  recognize: (command, context) => {
    if (context.openDbs.length === 0) return { match: false, reliability: 0 };

    const trimmed = command.trim();
    const first = /^([A-Za-z]+)\b/.exec(trimmed)?.[1]?.toUpperCase();

    let score = 0;
    if (first && SQL_START.has(first)) score = 0.8;

    const hits = SQL_KEYWORDS.filter((k) =>
      new RegExp(String.raw`\b${k.replace(' ', String.raw`\s+`)}\b`, 'i').test(trimmed),
    ).length;
    score += Math.min(0.18, hits * 0.09);
    if (/;\s*$/.test(trimmed)) score += 0.05;

    score = Math.min(score, 0.98);
    return { match: score >= 0.5, reliability: score };
  },
};
