# Remove --here Flag, Accept Project Root as Positional Argument

**Complexity: 2/10** — purely CLI parsing change, no behavior or wire changes, touches 5 files.

## Summary

Replace `janus --here=<dir>` with `janus [<project-dir>]` — the project root becomes a positional second argument instead of a named flag. When omitted, `process.cwd()` is used, matching current default behavior.

## Decisions

1. **Remove `--here` entirely.** No backward-compat shim — the flag was introduced in the same release cycle and `--here` appears nowhere in help.md, only in specs and docs that are updated as part of this fix.

## Proposed changes

### 1. `src/cli-args.ts`
- Replace `here: string | undefined` with `projectDir: string | undefined` in `CliArgs` interface.
- Remove `here: { type: 'string' }` from the parseArgs options.
- Set `allowPositionals: true`.
- After parsing, take `values.positionals[0]` (if any) as the project root, validate it's an existing directory, resolve to absolute path.
- Update `usageText()` to show `janus [options] [<project-dir>]` and replace `--here=<dir>` line with `[<project-dir>]  Target directory (default: current directory)`.

### 2. `src/cli-args.test.ts`
- Remove `--here` tests, replace with positional-arg tests doing the same validation.
- Update the "positional argument throws" test to accept one positional arg.
- Update defaults test to check `projectDir` is undefined.
- Update usage text test to not reference `--here`.

### 3. `src/main.ts`
- `args.here` → `args.projectDir`

### 4. `src/instance-lock.ts`
- Update error message `--here=<other-directory>` → `janus <other-directory>`

### 5. `specs/cli.md`
- Remove `--here=<dir>` row from flags table, add `<project-dir>` as a positional instead.
- Update usage syntax in heading.
- Update error messages.

## Out of scope
- Plumbing project root through TabManager (separate issue: "the project root when specified should be used through the application").
- Browser tab labels, file navigator, shell defaults — separate issue.
- Public documentation updates.
