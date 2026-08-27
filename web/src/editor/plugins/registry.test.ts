import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EDITOR_PLUGIN_API_VERSION, type EditorPluginDeclaration } from './api';
import { chordId, claimedByCore } from './chords';
import { editorPluginDeclarations, editorPluginLoaders, validateDeclarations } from './registry';

function declaration(overrides: Partial<EditorPluginDeclaration> = {}): EditorPluginDeclaration {
  return {
    id: 'fixture',
    version: '1.0.0',
    apiVersion: EDITOR_PLUGIN_API_VERSION,
    bindings: [{ command: 'do-it', chord: { key: 'j', meta: true }, needs: 'selection' }],
    ...overrides,
  };
}

describe('the shipped registry', () => {
  it('declares a loader for every plugin and a plugin for every loader', () => {
    expect(Object.keys(editorPluginLoaders).toSorted((a, b) => a.localeCompare(b)))
      .toEqual(editorPluginDeclarations.map((entry) => entry.id).toSorted((a, b) => a.localeCompare(b)));
  });

  it('loads every plugin entry with a callable handler behind it', async () => {
    for (const [id, load] of Object.entries(editorPluginLoaders)) {
      const module = await load();
      expect(module.default, id).toBeTypeOf('function');
    }
  });

  it('accepts every shipped declaration', () => {
    const { accepted, rejections } = validateDeclarations();
    expect(rejections).toEqual([]);
    expect(accepted).toHaveLength(editorPluginDeclarations.length);
  });

  it('declares only chords the core editor table does not keep for itself', () => {
    for (const entry of editorPluginDeclarations) {
      for (const binding of entry.bindings) expect(claimedByCore(binding.chord), binding.command).toBe(false);
    }
  });

  it('declares no chord twice, so no shipped plugin can shadow another', () => {
    const chords = editorPluginDeclarations.flatMap((entry) => entry.bindings.map((b) => chordId(b.chord)));
    expect(new Set(chords).size).toBe(chords.length);
  });

  // The registry is reachable from the entry bundle, so a static import of an implementation would
  // pull that plugin's chunk in with it and silently defeat the lazy loading the thunks exist for.
  it('reaches its implementations only through dynamic import', () => {
    const source = readFileSync('web/src/editor/plugins/registry.ts', 'utf8');
    const statics = [...source.matchAll(/^import\s[^;]*?from\s+'(?<path>[^']+)'/gmu)]
      .map((match) => match.groups?.path ?? '');
    expect(statics.filter((path) => path.includes('commenting'))).toEqual([]);
    expect(source).toContain("() => import('./commenting/index')");
  });
});

// `documentation/developer-documentation/editor-plugins.md` presents itself as the authoritative
// description of the contract and shows the shipped commenting declaration as its worked example.
// Nothing here checks prose — these assertions only pin the block a reader would copy into a new
// plugin, and the field list that block has to satisfy.
describe('the developer documentation', () => {
  const documentation = readFileSync(
    'documentation/developer-documentation/editor-plugins.md', 'utf8',
  );

  it('shows the declaration the repository actually ships', () => {
    const block = /```ts\n(?<example>\{\n\s*id: 'commenting',[^`]*?)```/u
      .exec(documentation)?.groups?.example;
    expect(block).toBeDefined();

    const shipped = editorPluginDeclarations[0];
    expect(block).toContain(`id: '${shipped.id}'`);
    expect(block).toContain(`version: '${shipped.version}'`);
    // Named rather than repeated as a literal, so an API bump cannot leave the example behind.
    expect(block).toContain('apiVersion: EDITOR_PLUGIN_API_VERSION');
    expect(block).toContain(`command: '${shipped.bindings[0].command}'`);
    expect(block).toContain(`needs: '${shipped.bindings[0].needs}'`);
  });

  it('documents every field a declaration requires', () => {
    const shipped = editorPluginDeclarations[0];
    const fields = [...Object.keys(shipped), ...Object.keys(shipped.bindings[0])];
    for (const field of fields) expect(documentation, field).toContain(`| \`${field}\` |`);
  });

  it('records the trust level rather than overclaiming a sandbox', () => {
    expect(documentation).toContain('are not sandboxed');
    expect(documentation).toContain('cannot be interrupted');
  });
});

describe('validateDeclarations', () => {
  it('records a rejection rather than throwing on an API version mismatch', () => {
    const { accepted, rejections } = validateDeclarations([declaration({ apiVersion: 99 })]);
    expect(accepted).toEqual([]);
    expect(rejections[0].reason).toContain('requires editor plugin API 99');
  });

  it('rejects a declaration with no bindings', () => {
    const { rejections } = validateDeclarations([declaration({ bindings: [] })]);
    expect(rejections[0].reason).toBe('declares no bindings');
  });

  // A chord that could never fire is refused by `claimedByCore` at host construction, not here —
  // one rule, so an unmodified key the core table leaves alone is a legitimate declaration.
  it('accepts an unmodified chord the core editor table does not claim', () => {
    const { accepted, rejections } = validateDeclarations([declaration({
      bindings: [{ command: 'do-it', chord: { key: 'Tab', shift: true }, needs: 'selection' }],
    })]);
    expect(rejections).toEqual([]);
    expect(accepted).toHaveLength(1);
  });

  it('lets the first claimant of a chord keep it and rejects the second', () => {
    const { accepted, rejections } = validateDeclarations([
      declaration({ id: 'first' }),
      declaration({ id: 'second' }),
    ]);
    expect(accepted.map((entry) => entry.id)).toEqual(['first']);
    expect(rejections).toEqual([
      { id: 'second', reason: 'chord for "do-it" is already claimed by "first"' },
    ]);
  });

  it('leaves an unrelated plugin working when another is rejected', () => {
    const { accepted } = validateDeclarations([
      declaration({ id: 'broken', bindings: [] }),
      declaration({ id: 'fine' }),
    ]);
    expect(accepted.map((entry) => entry.id)).toEqual(['fine']);
  });
});
