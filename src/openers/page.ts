import type { OpenContext } from './types.js';

export function normalizeWebUrl(target: string): { url: string } | { error: string } {
  let raw = target.trim();
  if (!raw) return { error: 'empty URL' };
  // Reject non-http/https schemes explicitly (e.g. javascript:, file:, ftp:).
  if (/^[a-z][a-z\d+\-.]*:/i.test(raw) && !/^https?:/i.test(raw)) {
    return { error: `unsupported scheme in "${raw}"` };
  }
  // Bare target (no scheme) — default to https.
  if (!/^https?:/i.test(raw)) raw = `https://${raw}`;
  try {
    const parsed = new URL(raw);
    return { url: parsed.href };
  } catch {
    return { error: `invalid URL "${target}"` };
  }
}

// Strip leading "www." and reduce to the registrable domain (last 2 labels, or 3 when the
// second-level label is a well-known short SLD: co, com, org, net, gov, ac, edu).
export function rootDomain(hostname: string): string {
  const clean = hostname.replace(/^www\./i, '');
  const labels = clean.split('.');
  if (labels.length <= 2) return clean;
  const SHORT_SLDS = new Set(['co', 'com', 'org', 'net', 'gov', 'ac', 'edu']);
  const second = labels.at(-2) ?? '';
  const keep = SHORT_SLDS.has(second) ? 3 : 2;
  return labels.slice(-keep).join('.');
}

export const webOpener = {
  name: 'page',
  inline: (target: string, context: OpenContext): void => {
    const n = normalizeWebUrl(target);
    if ('error' in n) { context.note(`open: invalid URL "${target}"`); return; }
    context.openPageTab({ url: n.url, domain: rootDomain(new URL(n.url).hostname) });
  },
  external: (target: string, context: OpenContext): void => {
    const n = normalizeWebUrl(target);
    if ('error' in n) { context.note(`open: invalid URL "${target}"`); return; }
    const domain = rootDomain(new URL(n.url).hostname);
    context.note(context.openExternally(n.url) ? `Opening ${domain} in your browser…` : `No browser available. The address is ${n.url}`);
  },
};
