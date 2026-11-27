<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Withhold the MCP launch fragment from remote harnesses until the far host injects its own variables

Existing Issue: A remote launch builds its command from the local MCP decision, so it carries the MCP config fragment, while the remote spawn path deliberately injects no environment and the far side's harnessSpawnEnv call never receives an mcp option, leaving the config pointing at variables that are unset where the harness runs. Severity: 8/10

Existing Risk: 8/10 - Every remote harness launched while the local server is up gets a config whose URL and token are empty on the far host; codex expands the URL to an empty string and can reject the config, and claude and opencode register a dead MCP server, so the common remote launch breaks.

Proposal Risk: 2/10 - The command and the environment then agree on every host and local launches stay byte-for-byte unchanged; the residual risk is an older remote that ignores a new spawn flag, which a frame-level test can pin.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2256 "withhold MCP config from remote launches until the far host injects its own variables". In src/harness/tab-spawn.ts keep the single effective MCP decision in spawnTab, but add the fragment in buildHarnessCommand for a channel-backed spawn only when the spawn frame also carries that decision and the far host injects its own URL and token. Add an mcp flag to the spawn frame in src/remote/protocol-frames.ts, pass it from registerRemotePty in src/harness/tab-spawn.ts, and in src/remote/serve-processes.ts build the far host's own launch details and pass them as the mcp option to harnessSpawnEnv so no local token crosses the wire. Keep the no-local-environment branch of finishSpawn unchanged. Update the remote paragraph of the MCP section in product/specs/harness.md to state the behavior that ships. Add tests beside src/harness/tab-spawn.test.ts asserting a remote launch has no --mcp-config until the frame flag and far-side injection exist, and extend src/remote/serve-processes-browser.test.ts to cover the injected variables; the existing local-launch, --no-mcp, --offline, server-down and claude-timeout tests must keep passing unchanged.


* Remove the dangling mcp-server spec link from the harness MCP section

Existing Issue: The MCP section added to product/specs/harness.md ends by pointing readers to [[mcp-server]], but no product/specs/mcp-server.md exists, so the link resolves to nothing. Severity: 2/10

Existing Risk: 3/10 - A reader following the only cross-reference in the new section lands nowhere, leaving the server behavior it delegates to undiscoverable while the feature is still being assembled.

Proposal Risk: 1/10 - Deleting the reference makes the paragraph self-contained, with only the minor residual risk that details meant for the future spec stay inline until that page exists.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2256 "remove the dangling mcp-server spec link from the harness MCP section". In product/specs/harness.md delete the "(see [[mcp-server]])" reference from the MCP server config paragraph and keep its statements about JANISSARY_TAB, JANISSARY_MCP_URL, JANISSARY_MCP_TOKEN, the token staying out of argv, the two claude overrides, and the single effective launch decision so the section stands on its own. Do not edit any source file: src/harness/scratch-dir.ts and src/harness/tab-spawn.ts already implement those statements. Verify the remaining wiki links in product/specs/harness.md point to files that exist.
