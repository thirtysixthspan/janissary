<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the pull request description and the ACP spec where they say a harness with no known deny-all configuration runs on the permission denial alone, when every other harness is refused at launch.

Existing Issue: The description says "Any other harness runs on layer two alone, with no warning" and `product/specs/acp.md` says "A harness with no known configuration runs with the second layer alone and no warning", while `baseLaunchForEntry` in `src/acp/launch.ts` returns undefined for every harness but opencode, claude, and codex, so such an entry fails with `no ACP adapter for harness "<name>"` and never runs at all. Severity: 3/10

Existing Risk: 3/10 - A reviewer reads the description as saying that a gemini or kilo role entry now starts with only the request denial protecting it, and judges the policy against a launch path that does not exist, while the spec contradicts its own sentence two paragraphs earlier.

Proposal Risk: 1/10 - The rule survives as the design decision it is, for a harness added to the launch later; if the wording is still read as current behavior, the spec's adjacent "fails at once" sentence now agrees with it.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1983 "correct the claim that an unconfigured harness runs on layer two alone". In the bundled-adapters paragraph of the pull request description's "What" section ("Every key was confirmed for opencode, claude, and codex. Any other harness runs on layer two alone, with no warning."), state that every other harness is refused at launch today, and that a harness later added to `acpLaunchForEntry` without a deny-all entry in `internalToolDenial` (`src/acp/internal-tools.ts`) would run on the permission denial alone, with no warning. Make the same conditional rewording to the "A harness with no known configuration..." sentence in the role-connection paragraph of `product/specs/acp.md`. No code changes; `src/acp/launch.test.ts` already pins the undefined launch for an unknown harness and `src/acp/internal-tools.test.ts` pins the undefined denial.


* Correct the ACP spec's claim that a claude role entry runs with its effort, which neither the bundled adapter nor the old one reads.

Existing Issue: The sentence this pull request rewrote in `product/specs/acp.md` says "`claude` runs the Claude Agent ACP adapter bundled with Janissary, with the entry's model and effort", while the plan's own design decision records that `@agentclientprotocol/claude-agent-acp` 0.97.0 reads `ANTHROPIC_MODEL` but not `CLAUDE_THINKING_EFFORT`, so the entry's effort has no effect on a claude role session. Severity: 3/10

Existing Risk: 3/10 - A user sets a claude entry's effort in `roles.json` expecting deeper or cheaper thinking, the spec confirms it, and the session silently runs at the adapter's default.

Proposal Risk: 1/10 - The spec matches the launch; if effort support is added later through the adapter's `effort` session option, the corrected sentence is the one that has to change with it.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1983 "correct the ACP spec's claim that claude role entries honor their effort". In the launch paragraph of `product/specs/acp.md`, change the claude clause to say the adapter runs with the entry's model, and that the entry's effort is passed as `CLAUDE_THINKING_EFFORT` for parity but the pinned adapter does not read it, so it has no effect; leave the codex clause, whose effort does reach Codex through `CODEX_CONFIG`, as it is. Rename the `src/acp/launch.test.ts` case "launches a claude entry through the bundled adapter with its model, effort, and no built-in tools" so it does not imply the effort takes effect, keeping its assertion unchanged. Do not change `baseLaunchForEntry` in `src/acp/launch.ts`; honoring the effort is listed as out of scope in the plan.
