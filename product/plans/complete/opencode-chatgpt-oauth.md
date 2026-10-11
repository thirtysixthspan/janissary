# OpenCode ChatGPT OAuth in workspaces

**Complexity: 4/10.** Extend the existing application-side credential loading and workspace environment preparation, and keep transcript readers aligned with redirected OpenCode storage. No new transport or sandbox permissions.

## Goal

A workspaced OpenCode launch can use the host's saved ChatGPT OAuth login without reading the host's OpenCode credential store or writing credentials into the git clone.

## Approach

Read the host's `.codex/auth.json` alongside startup credential loading, keeping OAuth separate from the project tokens forwarded to remote hosts. Require nonempty access, refresh, and account-identity strings and exactly three nonempty base64url JWT segments. Decode an object payload with a positive numeric expiry whose millisecond value is a safe integer. Missing, unreadable, or malformed credentials clear the cached login and leave existing authentication behavior intact. Expired access tokens remain usable as refresh inputs; parsing validates syntax rather than verifying signatures.

Allocate the workspace's owner-only temporary sibling exclusively during provisioning, refusing an existing scratch root. Before readiness resolves and before any workspace child starts, seed only the OpenAI OAuth entry at `<workspace>.tmp/opencode-data/opencode/auth.json`. Create directories with mode `0700` and an exclusive staging file with mode `0600`, then publish the complete credential atomically without replacing an existing destination. Failed staging attempts remove their newly created data tree; cleanup failure still returns a bounded preparation failure.

Scratch-root allocation is required, but OAuth preparation is optional. Preparation returns available, absent, or failed, distinguishing unsafe destinations from storage failures without exposing exception text or credentials. Failure leaves the workspace ready and reports `ChatGPT OAuth unavailable: could not prepare private OpenCode credentials.` through the existing local notification service or remote readiness notice and launch notification. Local notice delivery cannot reject readiness, and a workspace released before readiness reports no local credential notice. Missing source credentials produce no failure notice.

Later spawn preparation only looks up an existing private credential file. It rejects symbolic links at the literal scratch root, data directory, OpenCode directory, and auth file, and checks the resolved data directory's containment. Safe lookup supplies `XDG_DATA_HOME` to workspace processes with isolation active or disabled. Existing refreshed credentials survive subsequent launches and credential-cache reloads; deletion never triggers another application-side write. When lookup finds no completed private copy, ambient data-home settings and API-key injection continue. Non-workspaced processes and browser children receive no OAuth bridge. Each workspace has its own copy, removed through the existing workspace reference and cleanup lifecycle. Remote hosts use their own saved login.

Local observers pass the owning workspace separately from the harness working directory, and remote transcript following uses the remote workspace. The OpenCode transcript factory selects workspace-private storage first, then ambient `XDG_DATA_HOME`, then the default home data directory. The reader accepts an explicit data-home override; otherwise its supplied home determines storage independently of the ambient environment. Existing flat and JSON database schemas and other harness readers retain their behavior.

## Implementation steps

1. Add OAuth parsing and cached startup loading in `src/project/opencode-oauth.ts`, wired through `src/project/tokens.ts` without adding OAuth to forwarded tokens.
2. Add atomic private credential preparation and safe read-only lookup in `src/sandbox/opencode-data.ts`. Allocate scratch and prepare OAuth in `src/workspace/scratch.ts`, called by `src/workspace/index.ts` before readiness. Inject only safely located storage through `src/sandbox/environment.ts` and `src/sandbox/index.ts`.
3. Carry optional credential notices through provisioning and `src/workspace/manager.ts`. Wire local notifications in `src/controller/create-managers.ts`, include the notice in `src/remote/serve-provision.ts`, and report it once through the shared remote launch path in `src/harness/remote-launch.ts`.
4. Pass workspace storage through `src/harness/observers.ts` and `src/remote/serve-transcript.ts`. Resolve storage precedence in `src/harness/transcript/sources.ts` and inject it into `src/harness/transcript/opencode.ts`.
5. Add the regression coverage below, update the matching specs and existing authentication documentation, record this completed plan, and remove the resolved issue and PR backlog entries. Validate coding changes with diff-scoped lint, typechecks, and related server tests.

## Tests

- OAuth conversion retains access, refresh, and account identity, with JWT expiry in milliseconds; expired access tokens are accepted for refresh.
- Missing fields, incorrect types, malformed JSON/JWT, empty or illegal JWT segments, non-object payloads, and invalid expiry return no credential. Malformed saved JWTs produce neither private auth nor a data-home redirect.
- Startup loading uses a fake home and replaces its credential cache on reload, including absent/unreadable files.
- Real workspace provisioning completes readiness with a private owner-only auth file; launches set `XDG_DATA_HOME` with isolation both active and disabled. Non-workspaced and browser spawns receive no OAuth bridge.
- Exclusive scratch allocation rejects existing directories and links. Read-only lookup rejects links at every credential component, including broken links; deleting or redirecting credentials before another launch cannot create or modify host fixture files.
- Existing private auth files survive subsequent spawns and credential reloads, separate workspaces retain separate copies, and workspace cleanup removes the credentials. API-key injection is retained; absent OAuth leaves ambient data-home settings unchanged.
- Destination collisions, directory-creation failures, and partial writes return bounded failures without publishing incomplete credentials. Failed staging permits another legitimate preparation before children start; optional failure preserves shell and Claude launch behavior and provider keys.
- Provisioning readiness resolves with its optional notice; local notification delivery uses the existing service, a released workspace reports none, and a delivery failure cannot reject readiness. Remote provisioning and the common remote launch path carry and report the same notice without failing readiness or reporting it twice.
- Local and remote transcript readers resolve and render messages from the redirected database. Competing SQLite fixtures verify that workspace-private storage wins over ambient storage and that a direct reader honors its supplied home; ambient-only launches and existing schema compatibility remain covered.
- All test fixtures stay under the project directory and never access real credentials.

## Spec updates

- `product/specs/workspaced-agent.md`: ChatGPT OAuth as an additional OpenCode authentication route, startup validation, provisioning before child launch, read-only reuse, refresh persistence, optional failure notices, cleanup, and host-local remote behavior.
- `product/specs/sandbox.md`: private OAuth storage and safe lookup without widening host credential-file access.
- `product/specs/harness-recording.md`: local and remote transcript following uses the launch's OpenCode data location, with workspace-private storage taking precedence over ambient settings.

## Documentation

The existing OpenCode authentication explanations in `documentation/user-documentation/advanced-agents/tokens.md` and `workspacing.md` describe the private copy, its lifecycle, optional failure, and remote behavior. `help.md` documents no affected authentication behavior and needs no change.

## Out of scope

New credential forwarding protocols, notification categories, dependencies, model catalog changes, copying other OpenCode provider credentials, changing sandbox carve-ins, refreshing credentials in Janissary, writing back to Codex credentials, re-seeding after workspace children start, signature or provider-claim verification, database schema or transcript rendering changes, other harness storage changes, and non-workspaced authentication changes. Scratch-root allocation failures remain provisioning failures. No new code comments.

## Validation

The 75 added regression cases across 12 test files passed during implementation. The final diff-scoped coding checks passed lint, incremental typechecks, and related server tests. The PR backlog is empty. This plan consolidation changes no code and runs no test suite, lint, or typecheck; the full human/CI gate remains separate.
