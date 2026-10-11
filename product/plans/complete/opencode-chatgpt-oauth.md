# OpenCode ChatGPT OAuth in workspaces

**Complexity: 4/10.** Extend the existing application-side credential loading and workspace environment preparation, and keep transcript readers aligned with redirected OpenCode storage. No new transport or sandbox permissions.

## Goal

A workspaced OpenCode launch can use the host's saved ChatGPT OAuth login without reading the host's OpenCode credential store or writing credentials into the git clone.

## Approach

Read the host's `.codex/auth.json` alongside startup credential loading. Validate the tokens and decode the access JWT's numeric expiry, converting seconds to milliseconds. Seed only the OpenAI OAuth entry in a private data directory inside the workspace's existing temporary sibling, then supply `XDG_DATA_HOME` to workspace processes. Preserve an existing private auth file so later spawns do not overwrite refreshed tokens. Missing, unreadable, or malformed source credentials leave existing authentication behavior intact. Expired access tokens remain usable as refresh inputs. The temporary directory follows existing workspace cleanup. Remote hosts use their own saved login; forwarding ChatGPT credentials is outside this fix.

OpenCode transcript sources must read the redirected database for local and remote workspaces, while other launches retain their usual data location. API-key injection continues alongside OAuth.

## Implementation steps

1. Add focused OAuth parsing/loading and private data-directory preparation modules. Wire startup loading through `src/project/tokens.ts` and data-home injection through `src/sandbox/environment.ts`. Run `./scripts/run.mjs check-diff`.
2. Pass workspace storage information through local and remote transcript source creation, and let the OpenCode reader use that data home. Run `./scripts/run.mjs check-diff`.
3. Add the regression tests below and run `./scripts/run.mjs check-diff`.
4. Update specs and existing authentication documentation, promote this plan, remove only the resolved backlog entry (including its attached example), and run `./scripts/run.mjs check-diff` before shipping.

## Tests

- OAuth conversion retains access, refresh, and account identity, with JWT expiry in milliseconds; expired access tokens are accepted for refresh.
- Missing fields, incorrect types, malformed JSON/JWT, and invalid expiry return no credential.
- Startup loading uses a fake home and replaces its credential cache on reload, including absent/unreadable files.
- Workspace launches seed a private owner-only auth file and set `XDG_DATA_HOME` with isolation both active and disabled; non-workspaced and browser spawns receive no OAuth file or redirect.
- Existing private auth files survive subsequent spawns; API-key injection is retained; absent OAuth leaves ambient data-home settings unchanged.
- Local and remote transcript readers resolve and render messages from the redirected database.
- All test fixtures stay under the project directory and never access real credentials.

## Spec updates

- `product/specs/workspaced-agent.md`: ChatGPT OAuth as an additional OpenCode authentication route, startup loading, refresh persistence, cleanup, and host-local remote behavior.
- `product/specs/sandbox.md`: private OAuth storage without widening host credential-file access.
- `product/specs/harness-recording.md`: transcript following uses the launch's OpenCode data location.

## Documentation

Update the existing OpenCode authentication explanations in `documentation/user-documentation/advanced-agents/tokens.md` and `workspacing.md`. `help.md` documents no affected authentication behavior and needs no change.

## Out of scope

New credential forwarding protocols, model catalog changes, copying other OpenCode provider credentials, changing sandbox carve-ins, refreshing credentials in Janissary, writing back to Codex credentials, and non-workspaced authentication changes. No new code comments.

## Validation

The implementation and all 37 new regression tests are complete. Lint and incremental typechecks pass. Diff checks passed the related server suite during implementation. The final runs fail ten existing WebSocket tests when macOS allocates their loopback servers ports in the workspace's reserved browser band; connections receive EPERM even after an escalated retry. Shipping remains pending a passing complete diff check.
