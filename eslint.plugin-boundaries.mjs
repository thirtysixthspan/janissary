// The tab-plugin architecture's import boundaries, as lint rules.
//
// Four layers, each with its own rule because each has a different neighbour it must not reach:
// a concrete plugin (server and client), the host's plugin infrastructure, and core. Together they
// enforce the two architectural promises `ai/guidelines/plugins.md` makes — plugins depend only on
// a published contract, and concrete behavior is reachable only through a lazy loader map, never a
// static import that would drag it into startup or the client entry chunk.
//
// A note on `import()`: `no-restricted-imports` inspects static import declarations only, so the
// literal `import('./video/activate.js')` in `loaders.ts` and `import('./video/index')` in
// `registry.tsx` are deliberately untouched by the rules below. That is the whole point — those two
// maps are the only sanctioned way in, and everything else is closed.
export const pluginBoundaries = [
  // Concrete plugin implementations receive only their public host API, their own files, and
  // external/Node modules. The documented host utilities are pure functions with a caller on each
  // side of the boundary: the size formatter, the web-target normalizer that core's profile relaunch
  // and the page plugin must agree on to the character, and the numbered-sibling writer the video and
  // image plugins share so "a numbered PNG beside an original" has one rule rather than two.
  {
    files: ['src/plugins/*/**/*.ts', 'src/plugins/*/*.ts'],
    ignores: ['**/*.test.ts', '**/*.test.tsx'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          regex: String.raw`^\.\./(?!(?:api\.js|\.\./openers/(?:size|web-target|numbered-sibling)\.js)$)`,
          message: 'Server tab plugins must use src/plugins/api.ts capabilities instead of host internals.',
        }],
      }],
    },
  },
  {
    files: ['web/src/plugins/*/**/*.ts', 'web/src/plugins/*/**/*.tsx', 'web/src/plugins/*/*.ts', 'web/src/plugins/*/*.tsx'],
    ignores: ['**/*.test.ts', '**/*.test.tsx'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          regex: String.raw`^(?:\.\./(?!api$)|@shared/(?!plugins/[^/]+/shared$))`,
          message: 'Client tab plugins must use their client API and an import-free shared contract.',
        }],
      }],
    },
  },
  // The host's own plugin infrastructure. It is exempt from the core rule below because it composes
  // manifests and loader maps, which would otherwise trip it — but that exemption must not become a
  // hole: a static import of behavior here defeats the lazy loader map exactly as it would in core.
  // Only a manifest, which is pure data, may be reached directly.
  {
    files: ['src/plugins/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          regex: String.raw`^\./[^/]+/(?!manifest\.js$)`,
          message: 'Host plugin infrastructure may statically import only a plugin manifest; behavior loads through src/plugins/loaders.ts.',
        }],
      }],
    },
  },
  // Core may know manifests and host infrastructure, but concrete behavior enters only through
  // the literal lazy loader maps. This keeps behavior out of startup and the client entry chunk.
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    ignores: ['src/plugins/**'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          regex: String.raw`plugins/[^/]+/activate\.js$`,
          message: 'Load concrete server plugin behavior through src/plugins/loaders.ts.',
        }],
      }],
    },
  },
  {
    files: ['web/src/**/*.ts', 'web/src/**/*.tsx'],
    ignores: ['web/src/plugins/**'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          regex: 'plugins/[^/]+/index$',
          message: 'Load concrete client plugins through web/src/plugins/registry.tsx.',
        }],
      }],
    },
  },
  // The client plugin host itself. It is reachable from the entry bundle, so a runtime import of any
  // plugin's shared contract would ship that plugin's guards eagerly and defeat the lazy chunk.
  // Type-only imports are fine — they are erased before the bundler ever sees them. The second
  // pattern is the same guard for a plugin's own entry: `registry.tsx` reaches one only through a
  // literal `import()`, and a static import there would fold the whole plugin into the entry bundle.
  {
    files: ['web/src/plugins/*.ts', 'web/src/plugins/*.tsx'],
    ignores: ['**/*.test.ts', '**/*.test.tsx'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          regex: '^@shared/plugins/',
          allowTypeImports: true,
          message: 'The client plugin host must not pull a plugin shared contract into the entry bundle.',
        }, {
          regex: String.raw`^\./[^/]+/`,
          message: 'The client plugin host must reach a plugin entry only through the literal import() in registry.tsx.',
        }],
      }],
    },
  },
];
