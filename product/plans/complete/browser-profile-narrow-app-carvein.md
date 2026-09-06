# Plan: Carve in Janissary's runtime for the browser, not Janissary's directory

**Complexity: 5/10** — the profile's read rules gain a shape they did not have (an allow, then a deny inside it, then an allow inside that), and the parameter list roughly doubles. The risk is not in the code; it is that a carve-in narrow enough to be worth doing is also narrow enough to stop the child starting on a layout this suite cannot exercise.

## Goal

The browser profile carves in `appDir` — Janissary's installation root, two levels up from `src/browser/` — as a recursive read. Its own comment argues that root is "janissary's own code rather than user data", and names the checkout overlap as reaching only "the code under test, which the agent driving this browser already has, not a secret".

That is wrong in a development install, where the installation root *is* the project directory. Under it sits `.janissary/`, and under that:

- **the project's credentials.** `src/project-tokens.ts` stores the configured GitHub, Claude, OpenCode and Gemini tokens beneath the project's `.janissary` directory.
- **the live session token.** `bin/janus.mjs` writes the server's own startup line, URL and session token included, to `.janissary/log/server.log`. A browser that reads it can drive the Janissary window the user is working in — the precise thing the feature's second design decision says is never injected, arrived at by another route.
- **every other tab's workspace.** `.janissary/workspace/` holds the clones, including uncommitted work in tabs unrelated to this browser.

There is a second hole behind that one. The profile's read model is "allow everything, then deny `$HOME`'s contents, then carve back in". Reads *outside* `$HOME` are never denied at all. So an installation at `/opt/janissary`, or a checkout under `/Users/Shared`, or anything on a remote host outside the home directory, exposes all of the above regardless of what the carve-in says. Narrowing the carve-in alone would leave that untouched.

## Approach

**Carve in the runtime, not the root.** `appDir` is replaced by the pieces the child actually needs to start: the `node_modules` directory, the tree the entry lives in (`src/` under tsx, `dist/` under a build — whichever one this process is running, which `e2e-child-command.ts` already determines), and the two files Node and tsx read from the root, `package.json` and `tsconfig.json`, as exact-path carve-ins rather than subpaths.

The two resolved Playwright package directories are carved in explicitly alongside them. They normally sit inside the installation's own `node_modules`, but in a hoisted layout they are a sibling further up and outside it; naming them directly means the narrowing does not depend on where the package manager put them.

**Deny the project state explicitly, after the allows.** Seatbelt takes the last matching rule, so a deny placed after the carve-ins covers the installation-outside-`$HOME` case that no amount of narrowing reaches. `<appDir>/.janissary` is denied there. The browser's own workspace and temp sibling are then allowed *after* that deny, because in a development install they live inside the very directory it names — `.janissary/workspace/browsers/…` — and would otherwise be denied along with everything else.

The resulting read section reads in four steps: everything, minus `$HOME`'s contents, plus the runtime, minus the project state, plus this browser's own scratch. Each step is narrower than the one before it, which is the property to preserve when anything is added later.

## Implementation steps

1. `src/sandbox/browser-profile.ts` — replace `app: DualPath` on `BrowserProfilePaths` with `appModules`, `appEntry`, `playwright`, `playwrightCore` (subpath carve-ins), `appManifest`, `appTsconfig` (literal carve-ins), and `appState` (a deny). Grow `BROWSER_READ_PARAMS` accordingly, add `BROWSER_FILE_PARAMS` and `BROWSER_DENY_PARAMS`, and restructure the read rules into the four steps above.
2. `src/sandbox/index.ts` — `browserSpawn` derives the six paths from the `browser` option and binds them.
3. `src/browser/e2e-server.ts` — pass the entry directory (from the launch resolution that already knows which tree is running) and the Playwright package directories instead of a bare `appDir`.
4. Run `./scripts/run.mjs check-diff` after each step.

## Tests

- `src/sandbox/browser-profile.test.ts` — the finding asks for more than "the credential names do not appear in the template", so these bind a checkout-shaped installation, where the root, the project directory, and the workspace parent are all the same path, and assert against the resolved rules:
  - the runtime pieces are carved in — `node_modules`, the entry tree, both Playwright directories, and the two root files as exact paths rather than subpaths;
  - the installation root itself is *not* carved in as a subpath, which is the regression that would silently restore everything;
  - representative state files are denied: the project token store, the server log holding the session token, and a sibling tab's workspace clone;
  - the deny follows the runtime carve-ins and precedes the browser's own workspace allow, so ordering is pinned rather than incidental — a rule moved above the deny would re-expose the state, and one moved below the workspace allow would break the browser;
  - the browser's own workspace and temp sibling stay readable even though they sit inside the denied directory.
- `src/sandbox/index.test.ts` — a browser spawn binds every parameter the profile names, and binds no parameter naming the bare installation root.
- `src/browser/e2e-server.test.ts` — the entry directory handed to the sandbox is the tree the launch resolution chose, so a source run carves in `src/` and a built run `dist/`, rather than one of them being carved in for both.

## Spec and documentation

`product/specs/sandbox.md` currently says the browser profile carves back in "the Chromium application bundle, the Node binary's directory, and Janissary's own installation root". That last item becomes what it now is: Janissary's runtime — its dependencies, the code tree being run, and its manifest — with the project's own state, credentials, logs and other workspaces denied inside it. `product/specs/harness.md` and both user-documentation pages say a `file:` read that got past the guard finds nothing worth having; that claim is now closer to true and is left as written rather than strengthened, since the sandbox section is where the boundary is described in detail.

## Out of scope

- The project directory when it is *not* the installation root — a global npm install driving a project elsewhere. Its `.janissary` is denied when it sits under `$HOME`, which is the ordinary case, and threading the project directory into the browser profile is a separate change.
- `.env` files and `.git` at the installation root. They are no longer carved in, and are denied outright when the installation is under `$HOME`; an installation outside it still exposes them through the broad read allow, which is the profile's existing model and not something this change alters.
- Rewriting the profile's "allow everything outside `$HOME`" model into an allowlist. That is the change that would close the whole class, and it is a much larger one.
