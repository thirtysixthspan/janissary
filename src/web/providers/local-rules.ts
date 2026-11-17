import { BlockList, isIP } from 'node:net';
import { ProviderRequestError } from './contract.js';

const PRIVATE_IPS = new BlockList();
PRIVATE_IPS.addSubnet('127.0.0.0', 8, 'ipv4');
PRIVATE_IPS.addSubnet('10.0.0.0', 8, 'ipv4');
PRIVATE_IPS.addSubnet('172.16.0.0', 12, 'ipv4');
PRIVATE_IPS.addSubnet('192.168.0.0', 16, 'ipv4');
PRIVATE_IPS.addSubnet('169.254.0.0', 16, 'ipv4');
PRIVATE_IPS.addSubnet('::1', 128, 'ipv6');
PRIVATE_IPS.addSubnet('fc00::', 7, 'ipv6');
PRIVATE_IPS.addSubnet('fe80::', 10, 'ipv6');

function keepsHttp(url: URL): boolean {
  const host = url.hostname;
  const address = host.startsWith('[') ? host.slice(1, -1) : host;
  const family = isIP(address);
  if (family !== 0) {
    return PRIVATE_IPS.check(address, family === 4 ? 'ipv4' : 'ipv6');
  }
  const name = host.endsWith('.') ? host.slice(0, -1) : host;
  if (name === 'localhost' || name.endsWith('.localhost')) return true;
  return !name.includes('.');
}

export function upgradedUrl(url: URL): URL {
  const copy = new URL(url.href);
  if (copy.protocol === 'http:' && !keepsHttp(copy)) copy.protocol = 'https:';
  return copy;
}

export function acceptedContentType(header: string | null): string {
  const mediaType = (header ?? '').split(';', 1)[0].trim().toLowerCase() || 'application/octet-stream';
  if (
    mediaType.startsWith('text/') ||
    mediaType === 'application/xhtml+xml' ||
    mediaType === 'application/json' ||
    mediaType === 'application/xml' ||
    mediaType.endsWith('+json') ||
    mediaType.endsWith('+xml')
  ) {
    return mediaType;
  }
  throw new ProviderRequestError(`unsupported content type ${mediaType}`);
}

export function decodeBody(bytes: Uint8Array, contentType: string | null): string {
  return decoder(charsetLabel(contentType)).decode(bytes);
}

function charsetLabel(contentType: string | null): string {
  if (!contentType) return '';
  for (const parameter of contentType.split(';')) {
    const separator = parameter.indexOf('=');
    if (separator === -1) continue;
    if (parameter.slice(0, separator).trim().toLowerCase() !== 'charset') continue;
    const value = parameter.slice(separator + 1).trim();
    return value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;
  }
  return '';
}

function decoder(label: string): TextDecoder {
  try {
    return new TextDecoder(label);
  } catch (error) {
    if (error instanceof RangeError) return new TextDecoder();
    throw error;
  }
}
