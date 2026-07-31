# `janus init` should install the project `.codex` and `.claude` configurations

**Complexity: 3/10** — small extension to the existing project scaffold, with recursive file copying and package metadata changes; no new subsystem.

## Goal

Make `janus init` install the repository's standard `.codex/` and `.claude/` configuration files into a target project. The standard files are authoritative and are refreshed on every run, while unrelated custom files in those directories are preserved.

## Approach

- Treat the tracked `.codex/` and `.claude/` directories at the Janissary package root as templates.
- Recursively create the corresponding target directories and copy template files with overwrite enabled, preserving unrelated project-specific additions.
- Resolve the template root from the module location so both the source checkout (`src/`) and compiled package (`dist/`) find the same templates.
- Include both dot-directories in the npm package file list so installed `janus` binaries have the templates available.

## Implementation steps

1. Extend `src/project-init.ts` with an idempotent recursive template installer and run it from `scaffoldProject`.
2. Update `package.json` to ship `.codex` and `.claude` with the package.
3. Add focused tests covering copied files, nested Codex rules, and preservation of existing configuration files.
4. Update the CLI functional spec and the existing new-project user guide to describe the installed configurations.

## Tests

- `src/project-init.test.ts`: `scaffoldProject` creates `.codex/config.toml`, `.codex/rules/default.rules`, and `.claude/settings.json` with the template content.
- `src/project-init.test.ts`: an existing standard configuration file is overwritten and an existing custom file in a configuration directory remains untouched.

## Spec updates

- `product/specs/cli.md`: document that `janus init` installs the standard `.codex/` and `.claude/` configuration files without overwriting existing files.

## Docs

- `documentation/user-documentation/workflows/creating-a-new-project.md`: mention the configuration files included by `janus init` and its preservation behavior.
- `help.md`: no update; it does not describe the detailed output of `janus init`.

## Out of scope

- Changing the contents or policy represented by the existing `.codex` and `.claude` templates.
- Removing unrelated project-owned files from the configuration directories.
- Installing configuration into a user's home directory.
