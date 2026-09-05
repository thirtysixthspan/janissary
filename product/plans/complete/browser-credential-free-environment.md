# Plan: Give the e2e browser a credential-free environment on every host

**Complexity: 4/10** — one allowlist, one helper, and a branch moved above another branch. The confined path's behaviour changes too, and deliberately.

## Goal

`sandboxSpawn` decides what environment a spawn gets in two places, and the browser reaches the wrong one first:

```
if (!options.workspaceDir || !sandboxWorkspaces || !sandboxAvailable())
  return { command, args, env: withWorkspaceCredentials(env, options) };   // ← the browser lands here
…
if (options.browser) …                                                     // ← never reached
```

On a non-macOS host, or with `sandboxWorkspaces` switched off, the browser child is handed the janissary server's **entire `process.env`**, plus the project's GitHub, Claude, OpenCode and Gemini tokens and the user's git identity that `withWorkspaceCredentials` adds. That is `NPM_TOKEN`, `AWS_*`, `SSH_AUTH_SOCK`, every provider key — to a browser, on exactly the hosts where nothing confines it afterwards. The spec's promise that a `file:` read getting past the guard "finds nothing worth having" is beside the point when the interesting material was handed to the process in its environment.

The confined path is narrower but still wrong for a browser. It returns `scrubEnv(env)`, and `scrubEnv` is a denylist that *deliberately exempts LLM provider keys* — `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_APPLICATION_CREDENTIALS` — because a harness needs its own credentials to function. A browser does not. It authenticates to nothing and pushes nowhere.

## Approach

Choose the browser's environment from what the browser *is*, not from whether the host can confine it.

**An allowlist, not a scrub.** `BROWSER_ENV_ALLOW` in `paths.ts` names every variable the child may inherit, and nothing else crosses. A denylist is the wrong instrument here: it has to anticipate each new credential variable, and the one already in the tree exempts a whole class on purpose. An allowlist fails closed — a credential nobody thought of is absent because it was never named.

What the child needs, and why each entry is on the list: `PATH` and `HOME` (Chromium and Playwright both read them), `TMPDIR` (the scratch temp sibling), `PLAYWRIGHT_BROWSERS_PATH` (or `chromium.executablePath()` cannot find a relocated bundle), the locale trio, `USER`/`LOGNAME`, and the Windows equivalents so a non-POSIX host is not broken by omission. Deliberately absent: `NODE_OPTIONS`, which would let ambient configuration inject a module into the child, and which is unnecessary because the loader arguments are passed explicitly.

**One branch, above the confinement test.** `options.browser` is answered before `sandboxSpawn` asks whether it can confine anything, so both paths return the same allowlisted environment and only the command differs: wrapped in `sandbox-exec` where Seatbelt is available, bare where it is not.

**Harnesses are untouched.** `withWorkspaceCredentials` and `scrubEnv` keep their present behaviour for every non-browser spawn. A workspaced tab on a host that cannot confine it still gets its tokens and its git identity, because a clone whose `origin` is HTTPS cannot push without them — that reasoning is about provisioning and is unaffected by this change.

## Implementation steps

1. `src/sandbox/paths.ts` — add `BROWSER_ENV_ALLOW` beside `ENV_SCRUB_PATTERNS`, with the comment explaining why this one is an allowlist.
2. `src/sandbox/index.ts` — add `browserEnv(env, tmpDir)`; add `browserSpawn(...)` holding both the confined and unconfined browser returns; call it from `sandboxSpawn` before the confinement test, and delete the old inline browser branch.
3. Run `./scripts/run.mjs check-diff`.

## Tests

- `src/sandbox/index.test.ts` — the unconfined case is the one with no coverage today, because the existing browser credential test skips when `sandboxAvailable()` is false:
  - with `sandboxWorkspaces` disabled, sentinel `NPM_TOKEN`, `AWS_SECRET_ACCESS_KEY`, `SSH_AUTH_SOCK`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` and `GEMINI_API_KEY` values reach the child in none of its variables — asserted over the whole environment's values, not by naming keys, so a variable renamed upstream cannot slip a sentinel through;
  - the project's configured tokens do not reach it either, and neither does the git identity, even though a harness spawned the same way does get both — the pair of assertions is what pins "browser, not host" as the thing that decides;
  - `PATH`, `HOME` and `TMPDIR` are present and usable, so the narrowing has not broken the launch;
  - `PLAYWRIGHT_BROWSERS_PATH` crosses when set;
  - `NODE_OPTIONS` does not;
  - the command and args are returned unwrapped, since there is nothing to confine with.
  - the same value assertions with sandboxing available, so the confined path stops inheriting provider keys as well; skipped where Seatbelt is not available.
- `src/browser/e2e-server.test.ts` — the child's spawn environment is whatever `sandboxSpawn` returned plus `TMPDIR`, so nothing downstream reintroduces a credential.

## Spec and documentation

`product/specs/sandbox.md` describes environment scrubbing for workspaced spawns and the browser's own profile. It gains a sentence under the browser's section: the browser process is given a named, minimal set of environment variables rather than a filtered copy of the server's, it receives none of the project's credentials or the user's git identity, and that holds on hosts where it runs unconfined as well as where Seatbelt applies. That last clause matters because the surrounding text is otherwise about what only applies on macOS. No `help.md` or user-documentation change.

## Out of scope

- Changing what a *harness* inherits, confined or not. Its credential needs are real and different, and narrowing them is a separate question with a much larger blast radius.
- The provider-key exemption in `ENV_SCRUB_PATTERNS` itself, which exists for the harnesses and stays.
- Anything reachable through the filesystem rather than the environment — the profile carve-in is the next finding.
