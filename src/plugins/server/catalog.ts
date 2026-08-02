import type { Command } from '../../commands/types.js';
import type { Opener } from '../../openers/types.js';
import { TAB_PLUGIN_CAPABILITIES, type TabPluginDeclaration } from '../api.js';

const COMMAND_NAME = /^[a-z][a-z0-9-]*$/i;
const KNOWN_CAPABILITIES = new Set<string>(TAB_PLUGIN_CAPABILITIES);

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

export function basicErrors(declarations: readonly TabPluginDeclaration[]): Map<string, string> {
  const errors = new Map<string, string>();
  const ids = new Set<string>();
  for (const declaration of declarations) {
    const error = basicError(declaration);
    if (error) errors.set(declaration.id, error);
    const id = declaration.id.toLowerCase();
    if (ids.has(id)) errors.set(declaration.id, `duplicate plugin id "${declaration.id}"`);
    ids.add(id);
  }
  return errors;
}

function basicError(declaration: TabPluginDeclaration): string | undefined {
  if (!declaration.id || !declaration.version) return 'invalid declaration identity';
  if (!Number.isSafeInteger(declaration.requiredApiVersion.major) || declaration.requiredApiVersion.major < 1) {
    return 'invalid required API major version';
  }
  if (!Number.isSafeInteger(declaration.requiredApiVersion.minor) || declaration.requiredApiVersion.minor < 0) {
    return 'invalid required API minor version';
  }
  if (!Number.isSafeInteger(declaration.payloadSchemaVersion) || declaration.payloadSchemaVersion < 1) {
    return 'invalid payload schema version';
  }
  // A declaration naming a capability this API version does not define is how a plugin drifts ahead
  // of the contract, so it is rejected before anything is imported.
  if (!isStringArray(declaration.capabilities)) return 'invalid declaration capabilities';
  const unknown = declaration.capabilities.find((capability) => !KNOWN_CAPABILITIES.has(capability));
  if (unknown !== undefined) return `unknown capability "${unknown}"`;
  return undefined;
}

// Each claim kind gets its own error map so the registry that owns that kind can drop a rejected
// declaration's adapter, rather than leaving a dead route parked on an extension or command name.
export function commandClaimErrors(
  declarations: readonly TabPluginDeclaration[],
  coreCommands: readonly Command[],
  textualCommands: readonly string[],
): Map<string, string> {
  const errors = new Map<string, string>();
  const claimed = new Set<string>();
  const reserved = new Set([
    ...textualCommands, ...coreCommands.map((command) => command.name), 'shell', 'harness', 'ssh', 'schedule',
  ].map((name) => name.toLowerCase()));

  for (const declaration of declarations) {
    const claims = declaration.commands ?? [];
    for (const claim of claims) {
      const name = claim.toLowerCase();
      if (!COMMAND_NAME.test(claim)) { errors.set(declaration.id, `invalid command claim "${claim}"`); break; }
      if (reserved.has(name) || coreCommands.some((command) => command.match(claim))) {
        errors.set(declaration.id, `command claim "${claim}" collides with a core route`);
        break;
      }
      if (claimed.has(name)) { errors.set(declaration.id, `duplicate command claim "${claim}"`); break; }
      claimed.add(name);
    }
  }
  return errors;
}

export function extensionClaimErrors(
  declarations: readonly TabPluginDeclaration[], coreOpeners: readonly Opener[],
): Map<string, string> {
  const errors = new Map<string, string>();
  const claimed = new Set(coreOpeners.flatMap((opener) => opener.extensions.map((extension) => extension.toLowerCase())));

  for (const declaration of declarations) {
    const claims = declaration.opener?.extensions ?? [];
    for (const claim of claims) {
      const extension = claim.toLowerCase();
      if (!extension.startsWith('.')) { errors.set(declaration.id, `invalid opener extension "${claim}"`); break; }
      if (claimed.has(extension)) { errors.set(declaration.id, `duplicate opener extension "${claim}"`); break; }
      claimed.add(extension);
    }
  }
  return errors;
}

export function mimeClaimErrors(
  declarations: readonly TabPluginDeclaration[], coreMime: Readonly<Record<string, string>>,
): Map<string, string> {
  const errors = new Map<string, string>();
  const claimed = new Set(Object.keys(coreMime).map((extension) => extension.toLowerCase()));

  for (const declaration of declarations) {
    const claims = Object.keys(declaration.opener?.mimeTypes ?? {});
    for (const claim of claims) {
      const extension = claim.toLowerCase();
      if (!extension.startsWith('.')) { errors.set(declaration.id, `invalid MIME extension "${claim}"`); break; }
      if (claimed.has(extension)) { errors.set(declaration.id, `duplicate MIME claim "${claim}"`); break; }
      claimed.add(extension);
    }
  }
  return errors;
}

export function catalogErrors(
  declarations: readonly TabPluginDeclaration[],
  coreCommands: readonly Command[],
  textualCommands: readonly string[],
  coreOpeners: readonly Opener[],
  coreMime: Readonly<Record<string, string>>,
): Map<string, string> {
  const errors = basicErrors(declarations);
  const claims = [
    commandClaimErrors(declarations, coreCommands, textualCommands),
    extensionClaimErrors(declarations, coreOpeners),
    mimeClaimErrors(declarations, coreMime),
  ];
  for (const kind of claims) for (const [id, reason] of kind) if (!errors.has(id)) errors.set(id, reason);
  return errors;
}

export function catalogLoaderErrors(
  declarations: readonly TabPluginDeclaration[], loaders: Readonly<Record<string, unknown>>,
): Map<string, string> {
  const errors = new Map<string, string>();
  const declared = new Set(declarations.map((declaration) => declaration.id));
  for (const id of declared) if (!Object.hasOwn(loaders, id)) errors.set(id, 'server behavior loader is missing');
  for (const id of Object.keys(loaders)) if (!declared.has(id)) errors.set(id, 'server behavior loader has no declaration');
  return errors;
}
