import { beforeAll, describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';
import path from 'node:path';

// The seven restricted-import blocks in `eslint.plugin-boundaries.mjs` encode the whole plugin
// architecture — plugins may not reach past their API, host infrastructure may import only a
// manifest, core reaches behavior only through the lazy loader maps, and the client plugin host must
// not pull a shared contract into the entry bundle. They are intricate regexes with negative
// lookaheads and a type-only exemption, and a regex that stops matching disables its rule silently:
// the first symptom would be a plugin's chunk folded into the entry bundle, which nothing reports.
//
// Technique copied from `src/eslint-feature-boundaries.test.ts`. Sources are synthetic and linted
// against paths that need not exist, so the cases stay valid as plugins come and go.

const eslint = new ESLint({
  cwd: process.cwd(),
  overrideConfigFile: path.join(process.cwd(), 'eslint.config.mjs'),
});

// Matched by suffix rather than exact id: the config writes the bare rule name while
// `allowTypeImports` is a typescript-eslint option, so either rule may be the one that resolves.
async function boundaryMessages(source: string, filePath: string) {
  const [result] = await eslint.lintText(source, { filePath: path.join(process.cwd(), filePath) });
  return result.messages.filter((message) => message.ruleId?.endsWith('no-restricted-imports'));
}

const importOf = (specifier: string) => `import * as x from '${specifier}'; void x;`;
const typeImportOf = (specifier: string) => `import type * as X from '${specifier}'; export type Y = X;`;

describe('plugin architecture import boundaries', () => {
  // ESLint loads eslint.config.mjs lazily on the first lint, so the whole config would otherwise be
  // billed to whichever case runs first and blow the default timeout. Paid here rather than assumed
  // paid by the feature-boundary suite, since the two run separately.
  beforeAll(async () => {
    await boundaryMessages('export {};', 'src/plugins/video/activate.ts');
  });

  it.each([
    [
      'a server plugin reaching a host internal',
      importOf('../../tab/openers.js'), 'src/plugins/video/activate.ts',
      'capabilities instead of host internals',
    ],
    [
      'a client plugin reaching the websocket client',
      importOf('../../ws'), 'web/src/plugins/video/index.tsx',
      'must use their client API',
    ],
    [
      'a client plugin reaching a non-plugin shared module',
      importOf('@shared/protocol'), 'web/src/plugins/video/index.tsx',
      'import-free shared contract',
    ],
    [
      'host infrastructure statically importing plugin behavior',
      importOf('./video/activate.js'), 'src/plugins/host.ts',
      'only a plugin manifest',
    ],
    [
      'a core server module importing plugin behavior',
      importOf('../plugins/video/activate.js'), 'src/tab/openers.ts',
      'through src/plugins/loaders.ts',
    ],
    [
      'a core web module importing a plugin entry',
      importOf('./plugins/video/index'), 'web/src/App.tsx',
      'through web/src/plugins/registry.tsx',
    ],
    [
      'the client plugin host importing a shared contract as a value',
      importOf('@shared/plugins/video/shared'), 'web/src/plugins/registry.tsx',
      'into the entry bundle',
    ],
    [
      'the client plugin host statically importing a plugin entry',
      importOf('./video/index'), 'web/src/plugins/registry.tsx',
      'only through the literal import()',
    ],
    [
      'an editor plugin reaching the editor model',
      importOf('../../model'), 'web/src/editor/plugins/multiselect/index.ts',
      "instead of the editor's internals",
    ],
  ])('rejects %s', async (_name, source, filePath, fragment) => {
    const messages = await boundaryMessages(source, filePath);
    expect(messages).toHaveLength(1);
    // Checked by message, not just by count: a case that tripped a different block's rule would
    // otherwise pass while its own block sat broken.
    expect(messages[0]?.message.toLowerCase()).toContain(fragment.toLowerCase());
  }, 15_000);

  it.each([
    ['a server plugin using its host API', importOf('../api.js'), 'src/plugins/video/activate.ts'],
    ['a server plugin using the shared file operations', importOf('../files.js'), 'src/plugins/video/activate.ts'],
    ['a server plugin using the web-target normalizer', importOf('../../openers/web-target.js'), 'src/plugins/page/activate.ts'],
    ['a server plugin using the numbered-sibling writer', importOf('../../openers/numbered-sibling.js'), 'src/plugins/video/activate.ts'],
    ['a client plugin using its client API', importOf('../api'), 'web/src/plugins/video/index.tsx'],
    ['a client plugin using the shared plugin stylesheet', importOf('../shared.css'), 'web/src/plugins/video/index.tsx'],
    ['a client plugin using its own shared contract', importOf('@shared/plugins/video/shared'), 'web/src/plugins/video/index.tsx'],
    ['host infrastructure importing a plugin manifest', importOf('./video/manifest.js'), 'src/plugins/host.ts'],
    ['the client plugin host importing a shared contract as a type', typeImportOf('@shared/plugins/video/shared'), 'web/src/plugins/registry.tsx'],
    ['an editor plugin using its contract', importOf('../api'), 'web/src/editor/plugins/multiselect/index.ts'],
  ])('allows %s', async (_name, source, filePath) => {
    expect(await boundaryMessages(source, filePath)).toEqual([]);
  });
});
