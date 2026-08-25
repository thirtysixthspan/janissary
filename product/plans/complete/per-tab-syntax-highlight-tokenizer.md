# Give the syntax-highlight memo an owner instead of a module global

**Complexity: 4/10** — one module's three `let`s become closure variables behind a factory, one hook holds an instance, and the module's tests stop sharing state. Two callers, one of them a test. No new architecture and no wire-protocol change. The behavior that changes is a bug: two editor tabs on the same language stop evicting each other's cache.

`web/src/editor/highlight/tokenize.ts` holds `previousLanguage`, `previousLines`, and `previousTokens` as module-level `let`s (lines 53-55) that `tokenizeDocument` reads and overwrites on every call, so one cache is shared by every editor tab. A stateful cache is a service, and §7 of `ai/guidelines/react-code-organization.md` is the rule it breaks — a module-level singleton cannot be swapped in tests and silently couples every importer to one instance — while §8 puts cross-call state below the pure-module row this file otherwise sits in.

## Goal

Each editor tab owns its own tokenizer, so its per-line reuse is unaffected by what any other tab is editing. `tokenize.ts` exports a factory rather than a function with hidden state, and its tests can no longer leak into each other.

## The bug this fixes

The cost is concrete and contradicts the code's own comment. `useSyntaxHighlight.ts` says it "owns the tokenize schedule for one editor tab", but the cache it schedules into is global. Two tabs open on the same language interleave into that single cache: each call overwrites `previousLines` with the *other* tab's document, so on the next call every line comparison misses, every line gets a fresh array, and the referential reuse that `EditorLine`'s `React.memo` depends on stops working — for both tabs, on every keystroke, for as long as both are open.

The `language !== previousLanguage` reset hides it when the two tabs hold different languages (the cache is simply cleared each time, which is merely wasteful). Same language is the bad case, and it is the common one.

## Design decisions

**A factory returning the closure, not a class.** There is no lifecycle to release and no second method — nothing to `dispose()`, nothing to subscribe to. §7 says use a module of functions when there is neither per-instance lifecycle nor multiple operations, and a factory closure is the smallest thing that gives each caller its own state. `createTokenizer()` returns a `(text, language) => TokenRange[][]` function directly.

**The hook holds it with `useRef(createTokenizer()).current`**, matching `useEditor.ts:27`'s `useRef(new UndoBuffer()).current` in the same directory. One instance per mounted tab is exactly the scope the cache should have, and it dies with the tab.

**The language reset stays.** Switching a tab's language mid-life is still possible (a rename changes the extension), and clearing on that is still correct. It just clears one tab's cache now rather than everyone's.

**`computeTokens`, `walk`, and `sameTokens` stay module-level and pure.** They hold no state; only the memo moves inside the closure. The file keeps its pure-module character apart from the one factory.

**`TokenRange` stays exported from the same module.** Three of the four importers take only that type and must not move.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| The memo logic to move, unchanged | `tokenize.ts:60`–`:74` |
| The pure token computation it wraps | `tokenize.ts:30`–`:51` (`computeTokens`, `sameTokens`) |
| The per-instance `useRef(...).current` idiom | `web/src/editor/useEditor.ts:27` |
| The hook that will own an instance | `web/src/editor/useSyntaxHighlight.ts:16` |
| The reuse case that currently reads the global | `tokenize.test.ts:70` |

## Implementation steps

1. **`web/src/editor/highlight/tokenize.ts`: replace the globals with a factory.** Delete the three module-level `let`s. Export `type Tokenizer = (text: string, language: string) => TokenRange[][]` and `createTokenizer(): Tokenizer`, whose body holds the same three variables as closure state and returns the current `tokenizeDocument` body verbatim. Remove the `tokenizeDocument` export — it has no callers left, and leaving it would leave a second, shared cache in the file.

2. **`web/src/editor/useSyntaxHighlight.ts`: hold one per tab.** `const tokenize = useRef(createTokenizer()).current;` beside the existing refs, and `recompute` calls `tokenize(text, language)`. Nothing else in the hook changes — the debounce, the load pass, and the size guards are untouched.

## Tests

- `web/src/editor/highlight/tokenize.test.ts` — every existing case keeps its assertions, taking a fresh `createTokenizer()` per case instead of the shared function, which is what stops them leaking into each other. Two new cases: two tokenizers do not share a cache (the bug above — tokenizing a different document through a second tokenizer leaves the first's reuse intact); and one tokenizer clears its own cache when the language changes.
- `web/src/editor/useSyntaxHighlight.test.ts` — a new case that two mounted hooks on the same language each keep their own reuse, driving the fix through the layer that had the bug.

## Out of scope

- **The `MAX_LINES` / `MAX_CHARS` guards and the 100ms debounce.** Untouched.
- **How highlight.js is loaded or which languages are registered** (`highlight/hljs.ts`, `highlight/registry.ts`).
- **Caching across tabs on purpose** — a shared, keyed cache might be a real optimization one day, but it would need eviction and a key, and it is not what this file is doing today.
- **`EditorLine`'s `React.memo` comparison** itself. The reuse contract it depends on is preserved, not changed.
