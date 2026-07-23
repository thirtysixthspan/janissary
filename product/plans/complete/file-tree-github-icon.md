# GitHub icon in the file navigator header

**Complexity: 4/10** — mirrors the existing `currentBranch`/`refreshGit` async-git plumbing (see
`file-tree-branch-metadata.md`), plus one new pure URL-building function and a new header button
that opens the URL through the app's own `open <url>` command (an in-app page tab), reusing the
existing `webOpener`/`openPageTab` path rather than a native browser tab.

## Goal

The file navigator's header already shows the root path and current branch (`.files-loc` /
`.files-branch` in `FileTreeHeader.tsx`). When the tree is rooted inside a git repository whose
`origin` remote points at GitHub, the header's action row also shows a GitHub icon button. Clicking
it opens an in-app page tab (the same view `open <url>` produces — see `openers/page.ts`) at that
repository's commits page for the current branch, e.g.
`https://github.com/thirtysixthspan/janissary/commits/master/` — not a native OS browser tab. When
there is no `origin` remote, or it isn't a `github.com` URL, or the branch can't be determined, no
button is shown — same degrade-quietly behavior as the existing branch text.

## Background

`src/git-status.ts` already has `currentBranch(root)`, an async, never-rejecting function feeding
`FileTreeView.branch` through `FilesTabState` → `refreshGit` → `FileTreeManager`'s rebuild. The same
refresh cycle is the natural place to also resolve the origin remote.

`src/workspace.ts` already has `toHttpsUrl(url)`, which normalizes `git@host:owner/repo.git` and
`ssh://git@host/owner/repo.git` into `https://host/owner/repo.git` (passing an already-HTTPS URL
through unchanged) — exactly the owner/repo extraction this needs, just missing the final
`/commits/<branch>/` composition and the `github.com`-only restriction. `workspace.ts`'s own
`getRemoteUrl` is synchronous and throws on a missing remote (fine for its fail-fast workspace-clone
caller); the file tree needs the same never-rejecting convention as `currentBranch`, so a new async
variant is added to `git-status.ts` rather than reusing `getRemoteUrl` directly.

## Approach

1. A new async, never-rejecting `remoteUrl(root)` in `src/git-status.ts`, mirroring `currentBranch`.
2. A new pure function `githubCommitsUrl(remote, branch)` in a new small module, `src/github-url.ts`,
   built on `toHttpsUrl` (imported from `workspace.ts`): strips the `.git` suffix, requires the host
   to be exactly `github.com`, and returns `https://github.com/<owner>/<repo>/commits/<branch>/` —
   or `undefined` if the remote isn't a `github.com` URL.
3. Thread a `githubUrl?: string` field through the same `FilesTabState` → `refreshGit` →
   `FileTreeManager.rebuild` → `FileTreeView` path `branch` already uses.
4. `FileTreeHeader.tsx` renders a new icon button in `.files-actions` when `githubUrl` is present,
   opening it the same way `FileTreeTab.tsx`'s `editFile`/`createNewFile` already send commands:
   `client.send({ method: 'command', params: { text: `open ${githubUrl}` } })`. This routes through
   the server's existing `open` command → `webOpener.inline` → `openPageTab`, landing in an in-app
   page tab (`PageTab.tsx`) — the same mechanism `open <url>` already uses — rather than a native OS
   browser tab. No existing icon fits (GitHub's brand mark isn't in the already-installed
   `@fortawesome/free-solid-svg-icons`, and adding the separate `@fortawesome/free-brands-svg-icons`
   package is an unnecessary new dependency for one icon), so the button renders a small inline SVG
   octocat mark directly, the same way the existing "Collapse all" button renders a plain `⊟` glyph
   instead of a `FontAwesomeIcon`.

## Implementation

1. **`src/git-status.ts`** — add:
   ```ts
   export async function remoteUrl(root: string): Promise<string | undefined> {
     try {
       const { stdout } = await execFileAsync('git', ['remote', 'get-url', 'origin'], { cwd: root });
       return stdout.trim() || undefined;
     } catch {
       return undefined;
     }
   }
   ```
2. **`src/github-url.ts`** (new file):
   ```ts
   import { toHttpsUrl } from './workspace.js';

   // Builds a GitHub commits-page URL for `remote`/`branch`, or undefined when `remote` isn't a
   // github.com origin (a non-GitHub host, or a URL toHttpsUrl couldn't normalize).
   export function githubCommitsUrl(remote: string, branch: string): string | undefined {
     const https = toHttpsUrl(remote);
     const match = /^https:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?\/?$/.exec(https);
     if (!match) return undefined;
     const [, owner, repo] = match;
     return `https://github.com/${owner}/${repo}/commits/${branch}/`;
   }
   ```
3. **`src/file-tree/manager.ts`** — `FilesTabState` gains `githubUrl?: string`, declared next to
   `branch` with a mirroring comment. `rebuild()`'s `tab.files = { ... branch: state.branch }` gains
   `githubUrl: state.githubUrl`.
4. **`src/file-tree/git-refresh.ts`** — `refreshGit` fetches `remoteUrl(root)` alongside
   `changedPaths(root)`/`currentBranch(root)` in the same `Promise.all`, then computes
   `githubUrl = remote && branch ? githubCommitsUrl(remote, branch) : undefined` and writes it onto
   `current.githubUrl` under the existing staleness/discard guard.
5. **`src/types.ts`** — `FileTreeView` gains `githubUrl?: string`, documented next to `branch`.
6. **`web/src/FileTreeGithubButton.tsx`** (new component) — takes `githubUrl: string` and
   `client: JanusClient`, and renders the button plus its inline SVG octocat mark:
   ```tsx
   export function FileTreeGithubButton({ githubUrl, client }: Properties) {
     return (
       <button
         type="button" className="files-github" title="Open on GitHub"
         onClick={() => client.send({ method: 'command', params: { text: `open ${githubUrl}` } })}
       >
         <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">
           <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 ..." />
         </svg>
       </button>
     );
   }
   ```
   A dedicated component (rather than inlining the SVG/handler into `FileTreeHeader.tsx`) keeps the
   octocat markup and its click behavior independently testable and out of the header's own render.
7. **`web/src/FileTreeHeader.tsx`** — add a `githubUrl?: string` prop; render
   `{githubUrl && <FileTreeGithubButton githubUrl={githubUrl} client={client} />}` first in
   `.files-actions`, before Search, so it reads as identifying the repo rather than acting on it.
8. **`web/src/FileTreeTab.tsx`** — pass `githubUrl={files.githubUrl}` into `<FileTreeHeader .../>`.
9. **`web/src/theme.css`** — add `.files-github` to the existing shared selector at `:712`
   (`.files-collapse-all, .files-dock-cycle, .files-new-directory, .files-new-file, .files-search`)
   and its `:hover` counterpart at `:716`, so it inherits the same muted/hover-brightens styling.

## Tests

- **`src/git-status.test.ts`** — new `describe('remoteUrl', ...)` block: resolves to the origin
  remote URL for a repo with one configured; resolves to `undefined` for a repo with no `origin`
  remote; resolves to `undefined` for a directory that is not a git repository.
- **`src/github-url.test.ts`** (new file) — `githubCommitsUrl`: builds the commits URL for an HTTPS
  origin (`https://github.com/owner/repo.git` → `.../owner/repo/commits/main/`); builds it for an
  SSH/SCP origin (`git@github.com:owner/repo.git`); returns `undefined` for a non-GitHub host (e.g.
  `git@gitlab.com:owner/repo.git`); returns `undefined` for a malformed/empty remote.
- **`src/file-tree/manager.test.ts`** — extend the `'branch metadata'` describe block (or add a
  sibling `'github url metadata'` block) mirroring its existing branch cases: `githubUrl` appears on
  `tab.files.githubUrl` once the async refresh resolves; reroot clears the previous value and
  triggers a fresh refresh; a refresh that resolves after the tab closed is discarded. Requires a
  `remoteUrlMock` alongside the existing `changedPathsMock`/`currentBranchMock`, wired into the same
  `vi.mock('../git-status.js', ...)` call.
- **`web/src/FileTreeGithubButton.test.tsx`** (new file) — clicking the button sends
  `{ method: 'command', params: { text: 'open <githubUrl>' } }`.
- **`web/src/FileTreeTab.test.tsx`** — a case asserting a `.files-github` button renders when
  `files.githubUrl` is present; a case asserting no `.files-github` element is present when it's
  `undefined`. Click behavior itself is covered by `FileTreeGithubButton.test.tsx`.

## Out of scope

- Any git host other than `github.com` (GitLab, Bitbucket, self-hosted) — the issue's example is
  GitHub-specific, and `github-token.ts`/`git-sync.ts` already assume a GitHub-hosted origin
  elsewhere in the app.
- Linking to anything other than the commits page for the current branch (no PR list, no issues
  link, no repo homepage) — matches the issue's exact example URL shape.
- Adding `@fortawesome/free-brands-svg-icons` as a dependency — the inline SVG covers this one icon.

## Verification

- `./scripts/run.mjs check-diff`
- Manual: open `files` inside this repository (a GitHub-hosted checkout) and confirm the GitHub
  icon appears and clicking it opens `https://github.com/thirtysixthspan/janissary/commits/<branch>/`
  in an in-app page tab (not a native browser tab); open `files` rooted outside any git repository,
  or inside a repo with no `origin` remote, and confirm no icon appears.
