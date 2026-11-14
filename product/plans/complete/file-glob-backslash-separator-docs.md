# Document that a backslash in a file glob pattern is a folder separator, not an escape

**Complexity: 1/10** — docs-plus-test: 0 production lines, 0 production files, 3 requirements, 0 production scenarios (p=2.56)

`normalizeGlobPattern` in `src/file-glob/pattern-limits.ts` rewrites every `\` in a `file glob` pattern to `/` before the caps are judged and before minimatch compiles it, so a backslash separates folders and cannot escape a wildcard or a brace. `help/file.md` **Finding files** and `product/specs/acp.md` `### File glob` mention the rewrite only inside the `..` refusal sentence ("with `\` read as `/`"), never as a pattern rule. A person or agent used to POSIX globs writes `foo\*.ts` to match a literal star and silently gets a search for `foo/*.ts`.

## Goal

`help/file.md` **Finding files** and the pattern paragraph of `product/specs/acp.md` `### File glob` both state that a backslash is read as `/`, so it separates folders and never escapes a wildcard or a brace, and that a literal `*`, `?`, `{`, or `[` in a name is matched with a bracket class such as `[*]`. A matcher test pins the workaround and the behavior it explains. No matcher option, normalization, or refusal text changes.

## Approach

The behavior is already correct; only its description is missing. Confirmed against the installed minimatch with the options in `src/file-glob/match.ts`: `a[*].ts` matches `a*.ts` and not `ax.ts`, `a[?].ts` matches `a?.ts`, `a[{].ts` matches `a{.ts`, and `a[[]b.ts` matches `a[b.ts`. `a\*.ts` normalizes to `a/*.ts`, so it matches `a/x.ts` and not `a*.ts`.

Add the matcher assertions first, so the documented workaround is pinned before it is written down. Then add the rule to the help page and the same rule to the spec. The existing test `treats a backslash as a path separator` in `src/file-glob/match.test.ts` pins the behavior being documented and stays untouched.

## Implementation steps

1. **Matcher test.** Add a case to `src/file-glob/match.test.ts` asserting `createGlobMatcher('a[*].ts', false)('a*.ts')` is true and `createGlobMatcher(String.raw`a\*.ts`, false)('a*.ts')` is false, plus the `[?]`, `[{]`, and `[[]` bracket forms the documentation names.
2. **Help page.** In `help/file.md` **Finding files**, in the pattern-rules paragraph beside the extglob sentence, add one sentence saying a backslash is read as `/`, so it separates folders and is never an escape, and that a literal `*`, `?`, `{`, or `[` in a name is matched with a bracket class such as `[*]`, with `a[*].ts` finding a file named `a*.ts`.
3. **Spec.** In `product/specs/acp.md` `### File glob`, state the same rule in the pattern paragraph, naming the rewrite every `\` to `/` before matching and the bracket-class workaround with the same example.

## Tests

- `src/file-glob/match.test.ts`: `a[*].ts` matches `a*.ts` and not `ax.ts`; `a[?].ts` matches `a?.ts`; `a[{].ts` matches `a{.ts`; `a[[]b.ts` matches `a[b.ts`; `String.raw`a\*.ts`` matches `a/x.ts` and not `a*.ts`. The existing backslash-as-separator case keeps passing.

## Docs and specs

- `help/file.md` **Finding files**: one sentence naming a backslash as a folder separator that cannot escape a wildcard or brace, and the bracket-class workaround for a literal `*`, `?`, `{`, or `[`.
- `product/specs/acp.md` `### File glob`: the same rule in the pattern paragraph, with the normalized-pattern detail.

## Out of scope

- Changing `normalizeGlobPattern`, the minimatch options, or any production code.
- The `..` refusal sentence, which already says `\` is read as `/`.
- `documentation/user-documentation/`, which never describes glob pattern syntax.
- The other entry in `product/backlog/pull-request.md`.
