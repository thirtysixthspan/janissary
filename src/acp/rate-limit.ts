// Best-effort detection of a rate-limit failure from an ACP query's error message. The ACP
// protocol and its agent adapters carry no structured error code, so this is a case-insensitive
// match against a small set of markers known to appear in provider rate-limit messages.
const RATE_LIMIT_MARKERS = ['429', 'rate limit', 'too many requests'];

export function isRateLimitError(message: string): boolean {
  const lower = message.toLowerCase();
  return RATE_LIMIT_MARKERS.some((marker) => lower.includes(marker));
}
