// Shared highlight.js core instance. Only the language grammars registered by the modules in
// `./languages/` get bundled — importing from `highlight.js/lib/core` (not the full `highlight.js`
// package) keeps unused grammars out of the client bundle.
export { default as hljs } from 'highlight.js/lib/core';
export type { HLJSApi } from 'highlight.js';
