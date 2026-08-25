// The `on <address>` clause's address parser: exactly one token, no flags. Deliberately separate
// from `src/ssh.ts`, whose job is the opposite — modelling ssh's full option grammar to *find* a
// destination among flags. Here the whole token is the address, so the grammar is a split and two
// character-set predicates.

const USAGE = 'Usage: on <[user@]host[:path]>.';

// Conservative allowed character sets, checked separately either side of the single `:` separator.
// This is not optional hardening: the destination and path are interpolated into the `$SHELL -lc`
// command line `spawnPty` builds, and an address can arrive from a profile file on disk rather than
// from something the user just typed. Rejecting is one predicate; quoting would be a scheme.
// Each pattern is a single character class under a single quantifier — no nesting, so neither can
// backtrack pathologically (see `security/detect-unsafe-regex`).
const DESTINATION_PATTERN = /^[\w.@-]+$/;
const PATH_PATTERN = /^[\w./~-]+$/;

// A parsed `on` address. `address` is the token exactly as typed (the metadata chip's tooltip, and
// what a profile entry round-trips); `destination` is what ssh is given; `host` is the bare host
// for the chip; `path` is the remote project root, absent when the remote should walk up from its
// ssh login directory.
export type RemoteAddress = {
  address: string;
  destination: string;
  host: string;
  path?: string;
};

// The bare host of a destination: any `user@` prefix removed.
export function bareHost(destination: string): string {
  return destination.replace(/^[^@]*@/, '');
}

/**
 * Parse the token following `on` into `[user@]host[:path]`, splitting at the first `:` and treating
 * everything after it as a **path**, never a port — a trailing `:2222` names a directory `2222`.
 * A host needing a non-default port, an identity file, or a jump host is expressed as a `Host`
 * alias in the user's `~/.ssh/config` and named by that alias, which keeps this clause a single
 * unambiguous token. An absent or empty token is a usage error; an address carrying anything
 * outside the allowed character set is rejected by name rather than escaped.
 */
export function parseRemoteAddress(token: string | undefined): RemoteAddress | { error: string } {
  const address = token?.trim() ?? '';
  if (!address) return { error: USAGE };
  const separator = address.indexOf(':');
  const destination = separator === -1 ? address : address.slice(0, separator);
  const path = separator === -1 ? undefined : address.slice(separator + 1);
  if (!DESTINATION_PATTERN.test(destination)) return { error: rejected(address) };
  if (path !== undefined && !PATH_PATTERN.test(path)) return { error: rejected(address) };
  return { address, destination, host: bareHost(destination), path };
}

function rejected(address: string): string {
  return `Invalid remote address "${address}". Use [user@]host[:path] with letters, digits, and . - _ / ~ only.`;
}
