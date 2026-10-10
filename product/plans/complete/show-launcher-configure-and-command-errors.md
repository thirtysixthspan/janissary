# Show launcher Configure and command errors

**Complexity: 5/10** — route Configure through the shared reply reporter and surface rejected command intents.

Configure returns a dispatch result, but `LauncherTab` accepts only string replies. Typed and rail command rejections are caught and clear the reply, so users receive no explanation for failures the host supplied.

## Goal

Show Configure dispatch output and unclaimed results, and show an error when a typed, rail, or Configure intent rejects. Keep host-rendered ACP answers out of the launcher reply area.

## Approach

1. Extend `useLauncherSubmit` with one shared request and reporting path for typed lines, rail rows, and Configure.
2. Format rejected requests with the command line and error detail; preserve `coreResponse` suppression and application interception for typed and rail commands.
3. Add client tests for Configure success, an unclaimed result, and an oversized-file refusal, plus rejected typed and rail requests.
4. Confirm `product/specs/launcher.md` already describes visible command answers and errors.

## Tests

- `web/src/plugins/launcher/LauncherTab.test.tsx`: Configure displays dispatch output and unclaimed results, including the host's oversized-file refusal text.
- The same file: a rejected typed command and a rejected rail command show their error details.
- Existing `coreResponse` coverage continues to verify that the launcher does not duplicate the host ACP response.
- Run `./scripts/run.mjs check-diff` after each implementation step.

## Out of scope

- Changing server dispatch behavior or editor size limits.
- Changing core ACP response rendering or the application's command interception.
