# Make the Search Narrowing Fields Accept Wildcards and Paths

**Complexity: 2/10** — one `selects` function gains a normalization step and a second matching form,
and its tests are corrected to say what a wildcard means. No payload, no client, no new module.

## Goal

The **Files to include** and **Files to exclude** fields should accept the wildcards and the paths a
user actually types.

Two of the three things those fields are for do not work, and both fail silently — a search that
finds nothing, with nothing to say why.

**A wildcard that names no directory reaches nothing.** `*.test.ts` matches only the test files
sitting at the project root, and `src/a.test.ts` is invisible to it. The rule is that a bare
pattern matches at any depth, and the directory-prefix fallback applies it to a pattern with no
metacharacter in it — so `docs` reaches `docs/a.md` and `docs/deep/b.md` while `*.ts` reaches only
the two `.ts` files at the root. The field's own comment already claims the first behavior and its
test already pins the second, so the code and its documentation disagree and the code is what a user
meets. `*.md`, `*config*`, and `*.{ts,md}` are the things people reach for, and none of them work.

**A path anchored with `./` is not anchored when it is also a glob.** `./src` correctly refuses to
reach `lib/src/a.ts`, because the prefix rule strips the `./` and then requires the path to start
with `src/`. `./src/**` reaches nothing at all, because `./` is never stripped before the glob is
matched, and `matchesGlob('src/a.ts', './src/**')` is false. The anchoring the field documents works
for exactly the one form that has no wildcard in it.

## Approach

Both failures are in how a pattern is turned into something to match a project-relative
forward-slash path against, and both are answered in `filter-paths.ts` — which is where the whole
pattern language already lives, and where the spec points.

**Normalize the pattern first.** Strip a leading `./`, strip trailing `/`, and turn `\` into `/`:
the paths arriving from `listProjectFiles` are always forward-slashed and root-relative, so a
pattern written any other way is brought to that form before anything is asked of it. Anchoring is
then a property of the whole rule rather than of one branch, and `./src/**` behaves as `src/**`
because the `./` is gone before the glob is tried.

**Try a pattern that says nothing about depth at every depth.** A pattern with no `/` in it names
something anywhere in the tree, so it is also tried under `**/`. A pattern that does contain a `/`
is a statement about where in the tree to look and is tried as written, so `src/*.ts` stays about
`src/` and `*` still does not cross a directory boundary within it. The rule is the one VS Code
documents for these two fields, and it is the one the field's comment already describes.

**Leave the directory-prefix fallback alone.** A pattern with no metacharacter in it also selects
everything beneath it, so `src` covers `src/deep/b.ts`. That is a different question from the one
this fixes and its tests are correct as written.

## Implementation steps

1. **Normalize a pattern.** In `src/plugins/search/filter-paths.ts`, add a `normalize(pattern)`
   returning the pattern in the form `matchesGlob` expects: a leading `./` removed, trailing `/`
   removed, and `\` folded to `/`. `selects` normalizes once and works from the result throughout, so
   the anchoring the prefix rule performed by hand is now a property of every form.

2. **A pattern with no `/` is also tried at every depth.** In `selects`, after the pattern as written
   fails to match, a pattern that contains no `/` is matched a second time as `**/<pattern>`. The
   glob-metacharacter early return and the directory-prefix fallback stay, and the second attempt is
   only reached by a pattern that named no directory — the one case the fallback cannot serve.

## Tests

`src/plugins/search/filter-paths.test.ts`:

- Replace "does not let a bare * cross a directory boundary", which pins the behavior this item
  reverses, with "reads a bare wildcard as naming the file at any depth": `*.test.ts` in **Files to
  exclude** drops the tests from `src/` as well as from the root, and the same pattern in **Files to
  include** keeps them.
- Add a case that a bare character-class pattern also reaches into directories, since it takes the
  same second attempt.
- Keep the anchoring case that a `*` inside a pattern *with* a `/` still does not cross a boundary:
  `src/*.ts` keeps `src/a.ts` and drops `src/nested/b.ts`. That is the half of the rule the second
  attempt must not touch.
- Add a case that `./` anchors a glob as well as a path: `./src/**` selects `src/a.ts` and
  `src/nested/b.ts` and not `docs/a.md`, and `./src` still refuses `lib/src/a.ts`.
- Add a case for a trailing `/` and for a backslash: `src/*/` selects what `src/*` does, and
  `src\**` selects what `src/**` does.
- Add a case recording that the comma is always a separator, so `*.{ts,md}` is two patterns and
  neither field can narrow by a brace list. The `matchesGlob` support is real and unreachable, and
  the second attempt must not be read as having made it reachable.
- Every other case in the file is unaffected and still correct: comma separation, trimming, an empty
  field, exclude winning over include, an uncompilable pattern selecting nothing, and an exact
  extensionless name.

## Out of scope

- The fields' behavior in every other respect: where they are drawn, when they rerun a search, and
  the `search` intent they emit.
- Matching case-insensitively, which `matchesGlob` does not do and no field asks for.
- `**` and brace expansion, which `matchesGlob` already supports and which this leaves to it. A brace
  list is unreachable in either field, because the comma that separates patterns is the one inside
  it.
- A bare directory name reaching a directory of the same name deeper in the tree. `src` selects
  `src/…` and not `lib/src/…` today, and that is a separate question from whether a wildcard reaches
  into a directory.
