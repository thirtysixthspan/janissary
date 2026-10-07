# Remote shell sibling uses its answering tab

**Complexity: 3/10** — pass the intent's answering tab into the remote join path so a sibling shell joins the remote workspace that asked for it.

The ready bug is “error when opening a new remote shell from a remote shell.” The regression comes from a remote sibling request being evaluated against the command's original tab instead of the remote shell whose plus action or `Cmd+T` triggered the intent.

## Correct behavior

A remote shell's new-shell button and `Cmd+T` open another shell in that answering tab's existing remote workspace and channel. The sibling uses the answering shell's remote working directory when it is inside the workspace, and the workspace root otherwise.

## Reproduction

Added a focused regression case in `src/plugins/launch-tab-remote.test.ts` with a local command origin and a remote answering shell. Running `npm exec vitest -- run src/plugins/launch-tab-remote.test.ts` fails with `A remote workspace can only be joined from a remote tab.` The shell client turns the rejected sibling intent into `shell sibling intent failed`, which disables the shell plugin.

## Root cause

`createPluginContext` knows the answering tab for an intent, and `originTab()` returns that tab. However, `launchCapabilities` receives only the original command origin. The remote join branch then looks up and attaches to that original tab, which is local for a shell launched from a local command.

## Approach

Pass the answering tab label through `launchCapabilities` and use it as the source for remote join requests. Keep the original launch origin for standalone remote launches and other existing launch behavior.

## Implementation steps

1. Add the answering tab label to the launch capability context and resolve remote join source state from that tab.
2. Keep the failing regression case and verify it passes, while existing remote join and local launch tests remain green.
3. Correct the stale user documentation that says remote shells cannot open another remote shell.

## Regression test

`launchRemotePluginTab` joins using the answering remote shell even when the original command origin is a different local tab. The regression case currently fails before the fix with `A remote workspace can only be joined from a remote tab.`

## Verification

Run `./scripts/run.mjs check-diff` after each change. Run the focused remote launch tests before and after the fix. The attached browser started an isolated app and tried `zsh sibling-check on localhost`, but the remote shell never reached its ready state within 12 seconds; there was no remote-ready shell whose new-shell button or `Cmd+T` could be exercised. Live E2E was not possible because this environment did not provide a reachable remote workspace.

## Out of scope

Changing typed `zsh … on <address>` behavior from a remote tab, changing remote launch restrictions, or altering remote workspace/name rules.
