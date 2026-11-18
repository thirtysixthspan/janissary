import { isRecord } from '../api.js';

export type SavedHost = {
  name: string;
  host: string;
  user?: string;
  port?: number;
  path?: string;
};

export type FieldResult = { ok: true; host: SavedHost } | { ok: false; error: string };
export type DecodeResult = { ok: true; hosts: SavedHost[] } | { ok: false; error: string };

const NAME_PATTERN = /^[A-Za-z0-9._-]+$/;
const PATH_PATTERN = /^[A-Za-z0-9._~/-]+$/;
const PORT_PATTERN = /^[0-9]+$/;

const PLAIN_ALPHABET = '. - _';
const PATH_ALPHABET = '. - _ / ~';
const MISSING_DESTINATION = 'Missing destination.';
const NOT_A_CATALOG = 'Hosts catalog is not an object.';

function fieldError(field: string, value: unknown, alphabet: string): string {
  return `Invalid ${field} "${String(value)}". Use letters, digits, and ${alphabet} only.`;
}

function portError(value: string): string {
  return `Invalid port "${value}". Use digits only, from 1 to 65535.`;
}

type OptionalString = { value?: string; error?: string };

function optionalString(field: string, value: unknown, alphabet: string): OptionalString {
  if (value === undefined) return {};
  if (typeof value !== 'string') return { error: fieldError(field, value, alphabet) };
  if (value.trim().length === 0) return {};
  return { value };
}

type Destination = { host: string; port?: number; error?: string };

function splitDestination(destination: string): Destination {
  const colon = destination.indexOf(':');
  const host = colon === -1 ? destination : destination.slice(0, colon);
  if (host.length === 0 || !NAME_PATTERN.test(host)) {
    return { host, error: fieldError('host', host, PLAIN_ALPHABET) };
  }
  if (colon === -1) return { host };
  const portText = destination.slice(colon + 1);
  if (!PORT_PATTERN.test(portText)) return { host, error: portError(portText) };
  const port = Number(portText);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) return { host, error: portError(portText) };
  return { host, port };
}

export function isHostName(value: string): boolean {
  return NAME_PATTERN.test(value);
}

export function validateHostFields(
  name: unknown, user: unknown, destination: unknown, path: unknown,
): FieldResult {
  if (typeof name !== 'string' || !NAME_PATTERN.test(name)) {
    return { ok: false, error: fieldError('name', name, PLAIN_ALPHABET) };
  }
  if (typeof destination !== 'string') return { ok: false, error: MISSING_DESTINATION };
  const normalizedUser = optionalString('user', user, PLAIN_ALPHABET);
  if (normalizedUser.error !== undefined) return { ok: false, error: normalizedUser.error };
  if (normalizedUser.value !== undefined && !NAME_PATTERN.test(normalizedUser.value)) {
    return { ok: false, error: fieldError('user', normalizedUser.value, PLAIN_ALPHABET) };
  }
  const normalizedPath = optionalString('path', path, PATH_ALPHABET);
  if (normalizedPath.error !== undefined) return { ok: false, error: normalizedPath.error };
  if (normalizedPath.value !== undefined && !PATH_PATTERN.test(normalizedPath.value)) {
    return { ok: false, error: fieldError('path', normalizedPath.value, PATH_ALPHABET) };
  }
  const split = splitDestination(destination);
  if (split.error !== undefined) return { ok: false, error: split.error };
  const host: SavedHost = { name, host: split.host };
  if (normalizedUser.value !== undefined) host.user = normalizedUser.value;
  if (split.port !== undefined) host.port = split.port;
  if (normalizedPath.value !== undefined) host.path = normalizedPath.value;
  return { ok: true, host };
}

export function formatDestination(host: SavedHost): string {
  return host.port === undefined ? host.host : `${host.host}:${host.port}`;
}

export function sameHostName(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

export function decodeHosts(value: unknown): DecodeResult {
  if (!isRecord(value)) return { ok: false, error: NOT_A_CATALOG };
  const hosts: SavedHost[] = [];
  const taken = new Set<string>();
  for (const [name, entry] of Object.entries(value)) {
    if (!isRecord(entry)) return { ok: false, error: `Host "${name}" is not an object.` };
    const validated = validateHostFields(name, entry.user, entry.destination, entry.path);
    if (!validated.ok) return { ok: false, error: validated.error };
    const folded = name.toLowerCase();
    if (taken.has(folded)) return { ok: false, error: `Duplicate host name "${name}".` };
    taken.add(folded);
    hosts.push(validated.host);
  }
  hosts.sort((left, right) => {
    const a = left.name.toLowerCase();
    const b = right.name.toLowerCase();
    return a < b ? -1 : a > b ? 1 : 0;
  });
  return { ok: true, hosts };
}
