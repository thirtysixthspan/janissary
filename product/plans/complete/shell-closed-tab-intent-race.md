# Keep other shell tabs alive when one closes

**Complexity: 4/10** — one shared shell-intent error handler, its call sites, a focused regression test, and the related behavior specs.

## Root cause

The plugin capability wrapper discards the server's RPC error and replaces it with `Plugin intent "<intent>" failed`. A shell intent that races with tab closure therefore reaches the shell's catch block as a generic error. The shell reports it as fatal; `createPluginHost` records failures by plugin id and every shell `PluginBody` returns `null`. The live driver captured the actual reply, `Plugin tab "bug-repro3" not found`, followed by `pluginFailed` with reason `shell terminal-status intent failed`. The server can reject that later failure report because the tab is already closed, leaving the other tabs present but blank.

## Correct behavior

Closing the reattached remote shell closes only that tab. The `janus` shell remains visible, with its terminal and command bar working, and a late intent for the closed shell does not disable the `shell` plugin.

## Reproduction

In an isolated live app, open `zsh bug-repro on 127.0.0.1:/Users/ashmorgan/dev/janissary` against a local SSH test server, detach it from the shell metadata row, reattach it through `sessions`, then close the restored `bug-repro` tab and select `janus`. The failing run left the `janus` tab selected but rendered no `.shell-tab`, `.shell-body`, or command textarea; a screenshot showed the blank tab. The failure is timing-sensitive: another run through the same steps left the body rendered.

## Approach

Preserve the server's RPC error in `TabPluginClientCapabilities.intent`, falling back to the current generic message only when no error text exists. Treat the exact missing-plugin-tab error as an ordinary lifecycle refusal in shell intent catches. Keep reporting other failures, including malformed results, so genuine client-plugin failures still cross the fatal boundary. Route all shell intent rejection handlers through the same helper.

## Implementation steps

1. Preserve RPC rejection text in `createPluginClientCapabilities.intent` and test it in `web/src/plugins/api.test.ts`.
2. Add a shell helper that reports intent failures except the exact `Plugin tab "<label>" not found` lifecycle error.
3. Test that a cwd intent rejected after its owning tab closes does not report plugin failure, while an unrelated intent error still does.
4. Use the helper at every shell intent catch that currently calls `reportFailure`.

## Spec changes

Clarify the closed-tab intent rule in `product/specs/tab-plugins.md` and the surviving-shell behavior in `product/specs/shell-tab.md` after implementation verification.

## Regression test

`web/src/plugins/api.test.ts` verifies that an intent rejection preserves the server error text. `web/src/plugins/shell/report-shell-cwd.test.ts` rejects the `cwd` intent with `Plugin tab "bug-repro" not found` and asserts that the shell does not report a plugin failure. It also checks that an unrelated error still reports failure.

## Verification

Run `./scripts/run.mjs check-diff` after each implementation step. The final live run used `./temp/fix-a-bug-drivers/replicate.mjs` against a scratch app and the isolated local SSH server. After detach, reattach, and close, it selected `janus` and observed one `.shell-tab`, one `.shell-body`, and one command textarea. The buggy live run captured the missing-tab RPC reply and the fatal `pluginFailed` report that blanked `janus`.

## Out of scope

- Changing remote detach, reattach, or PTY ownership semantics.
- Changing the behavior of server-side fatal plugin failures.
- Adding new user-facing documentation for behavior that the existing shell guide already describes.
