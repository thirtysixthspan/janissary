# Let the launcher's summarizer find a persona in an ordinary project

**Complexity: 5/10** — one fallback beside the project read, one rule for which of the two wins, and a flush test that runs somewhere the repository's persona is not.

`readPersonaBody` in `src/plugins/launcher/persona.ts` reads exactly one file: `<project root>/ai/personas/launcher/summarizer.md`. `scaffoldProject` in `src/project/init.ts` creates `ai/personas/` as an empty directory and writes nothing into it — it seeds backlog files and `.janissary/launcher.json`, and no persona. So in a project that has actually run `janus init`, the path is missing, `readFileSync` throws, and the summarizer's intent handler reports the failure to the notifications feed on every flush. The launcher never produces a status summary anywhere but in this repository, whose own persona file is what the existing tests happen to read: they pass `process.cwd()` as the root, so the whole missing-file path is invisible.

## Goal

A flush finds a persona in an ordinary project, and a project that writes its own persona has it used.

## Approach

1. **`src/plugins/launcher/persona.ts`** reads the project's own persona when it exists and otherwise reads the copy the application ships with. The shipped path is resolved relative to this module, which sits at the same depth in `src/` and in `dist/`, so both the checkout and the installed package answer — the same approach `src/project/init.ts` already uses to find this application's own `.codex` and `.claude` directories.
2. The directive check stays where it is and applies to whichever file was read. A shipped file is this repository's own, so it is known good; a project's own file is the user's, and the check is what tells them it is malformed.
3. Nothing needs adding to `package.json`: `ai` is already in the published `files` list, so the shipped persona travels with the package today.

### Rejected alternatives

- Seeding the persona through `janus init` instead. It fixes a project initialised after this change and silently leaves every already-initialised project broken, and it puts a file into the user's tree they never asked for.
- Both: seed at init *and* fall back at read time. Two mechanisms for one answer, and the seeding one is the weaker half.
- Shipping the persona as a string constant in the plugin. It would stop being editable in this repository by the people who maintain it, which is the only place the persona's wording is maintained.

## Implementation steps

1. Add the shipped-path fallback and the precedence rule to `persona.ts`.
2. Add `src/plugins/launcher/persona.test.ts` for the absence and override cases.
3. Extend `activate.test.ts` with a flush in a scratch project that has no persona tree.
4. Run `./scripts/run.mjs check-diff`.

## Tests

- `src/plugins/launcher/persona.test.ts`: a project root with no persona answers the shipped body; a project root with its own file answers that one, directive stripped; a project file whose first line is not a directive is refused with the line naming what it should be.
- `src/plugins/launcher/activate.test.ts`: with a scratch project under `temp/` that has an `ai/` tree and no persona, a flush prompts — which it cannot do today, because the read throws before `promptAcp` is reached.

## Spec updates

- `product/specs/launcher.md`: the summarizer's persona is the project's own when the project has one, and the copy the application ships with otherwise.

## Out of scope

- Making the monitor's or the editor's personas resolvable the same way. They are not read by a plugin and this repository's tree is always there to read.
- Validating the shipped persona at startup. It is this repository's own file, covered like any other.
