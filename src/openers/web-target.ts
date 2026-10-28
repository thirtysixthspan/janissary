// What a web address is, as two pure functions: the normalization every `open <url>`, `open page
// <address>`, and in-place navigation runs, and the root domain a page tab is named after. Kept in
// core as a pure host utility rather than inside the page plugin: a scheme-rejecting predicate is
// the kind of check that should have one definition, and a second copy would be exactly the drift
// `ai/guidelines/plugins.md` calls out. It is the second host utility a server plugin may import,
// beside `openers/size.ts`.
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
