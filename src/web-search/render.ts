import type { WebSearchResult } from './contract.js';

const WHITESPACE_RUN = /\s+/g;

const LONE_HIGH_SURROGATE_AT_END = /[\uD800-\uDBFF]$/;

function collapse(text: string): string {
  return text.replaceAll(WHITESPACE_RUN, ' ').trim();
}

function encodeUrl(raw: string): string | undefined {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
  return url.href.replaceAll('(', '%28').replaceAll(')', '%29');
}

function escapeTitle(title: string): string {
  return title.replaceAll(/[\\[\]]/g, String.raw`\$&`);
}

export function normalizeResults(results: WebSearchResult[]): WebSearchResult[] {
  const normalized: WebSearchResult[] = [];
  for (const result of results) {
    const url = encodeUrl(result.url);
    if (url === undefined) continue;
    const title = collapse(result.title) || url;
    normalized.push({ title: escapeTitle(title), url, snippet: collapse(result.snippet) });
  }
  return normalized;
}

// The dedupe key is a fresh URL of the normalized result: the fragment is dropped and one trailing
// slash is removed from the path, so `https://e.com/a/?q=1` and `https://e.com/a?q=1` match. The
// URL constructor has already lowercased the scheme and host and dropped a default port.
function dedupeKey(url: string): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  parsed.hash = '';
  if (parsed.pathname.endsWith('/')) parsed.pathname = parsed.pathname.slice(0, -1);
  return parsed.href;
}

export function dedupeResults(results: WebSearchResult[]): WebSearchResult[] {
  const seen = new Set<string>();
  const kept: WebSearchResult[] = [];
  for (const result of results) {
    const key = dedupeKey(result.url);
    if (key === undefined || seen.has(key)) continue;
    seen.add(key);
    kept.push(result);
  }
  return kept;
}

function linkLine(result: WebSearchResult): string {
  return `- [${result.title}](${result.url})`;
}

function renderResult(result: WebSearchResult): string {
  const link = linkLine(result);
  return result.snippet === '' ? link : `${link}\n  ${result.snippet}`;
}

function renderRange(results: WebSearchResult[], count: number): string {
  return results
    .slice(0, count)
    .map((result) => renderResult(result))
    .join('\n');
}

function truncationNote(count: number, total: number): string {
  return `(showing ${String(count)} of ${String(total)} results; raise --max-chars for more)`;
}

function withNote(body: string, count: number, total: number): string {
  return count < total ? `${body}\n${truncationNote(count, total)}` : body;
}

function wholeResultCount(results: WebSearchResult[], total: number, maxChars: number): number {
  for (let count = results.length; count > 0; count -= 1) {
    if (withNote(renderRange(results, count), count, total).length <= maxChars) return count;
  }
  return 0;
}

function dropLoneHighSurrogate(text: string): string {
  return LONE_HIGH_SURROGATE_AT_END.test(text) ? text.slice(0, -1) : text;
}

// `room` counts the characters the snippet line may use, ellipsis included, so the snippet keeps
// `room - 1` characters and then the ellipsis.
function cutSnippet(snippet: string, room: number): string {
  return `${dropLoneHighSurrogate(snippet.slice(0, room - 1)).trimEnd()}…`;
}

function cutFirstResult(result: WebSearchResult, total: number, maxChars: number): string {
  const link = linkLine(result);
  const note = total > 1 ? `\n${truncationNote(1, total)}` : '';
  const room = maxChars - link.length - 3 - note.length;
  if (room <= 1) return `${link}${note}`;
  return `${link}\n  ${cutSnippet(result.snippet, room)}${note}`;
}

export function renderResults(results: WebSearchResult[], total: number, maxChars: number): string {
  if (results.length === 0) return '';
  const count = wholeResultCount(results, total, maxChars);
  if (count === 0) return cutFirstResult(results[0], total, maxChars);
  return withNote(renderRange(results, count), count, total);
}
