# Make the git-sync clone shallow and sparse

Issue: when setting up a workspace for git-sync, only clone the product directory at depth 1 - a sparse clone - in order for it to clone faster.

Complexity rating: 4/10

## Goal

Provision the shared git-sync clone with only the current commit and the `product/` tree checked out, reducing clone time and disk use while preserving normal sync behavior for configured product files.

## Approach

Extend the shared Git clone options to support a depth-1 sparse clone. Provisioning a Git-sync workspace opts into those options and checks out `product/`; ordinary agent, harness, and remote workspace clones remain full clones.

## Implementation steps

1. Add optional shallow and sparse-path clone options to `startGitClone`, including post-clone sparse-checkout configuration.
2. Allow workspace provisioning to pass clone options and configure Git-sync to request depth 1 with only `product/` checked out.
3. Add tests that verify sparse clone arguments, sparse checkout contents, and unchanged default workspace clone behavior.

## Tests

- `src/git/clone.test.ts`: shallow sparse clone arguments produce a checkout containing the selected directory but not unrelated repository content.
- `src/workspace/manager.test.ts`: existing workspace clones continue using default clone options.
- `src/git/sync.test.ts`: Git-sync provisioning requests depth 1 and the `product/` sparse path.

## Specs and docs

- `product/specs/editor-tab.md`: document that the shared Git-sync workspace contains the latest commit's `product/` tree.
- Public documentation and `help.md`: no user-facing behavior is changed.

## Out of scope

- Changing sync behavior for files outside `product/`.
- Making ordinary workspace clones shallow or sparse.
