# Correct opencode role sessions' built-in-tool wording

**Complexity: 2/10** — ~12 added comment lines, 2 production files, 3 requirements, and 2 spec scenarios (p=3.99).

## Goal

The pull request's description and `product/specs/acp.md` say every role harness launches with its built-in tools turned off, so the model is never offered them. For opencode that is false. An opencode `ask` or `tell` session keeps built-in tools such as `skill` in the model's list and refuses every call with a deny-all permission. A recorded probe showed a three-entry `skill` tool block ending in `Permission denied: skill` and no skill marker in the answer. The description and spec must say what actually happens: opencode keeps its tools and denies each call, while claude and codex do not offer theirs.

## Approach

Use a confirmed configuration if one can remove the tool from opencode's offered set. It cannot. `opencode debug agents --standalone` against the installed 2.2.5 build confirms that `permission: "deny"` becomes a final `*: *` deny rule, and that the bundled browser plugin later appends a `skill: browser` deny rule. opencode's whole-tool removal check reads the last rule matching the tool name, so the narrow browser rule defeats it and `skill` stays in the model's list. Adding the deprecated `tools: { "skill": false }` produces a `skill: *` deny rule before that browser rule, so it does not help either. No config key confirmed for 2.2.5 removes `skill` from the list without disabling the browser plugin, and plugin ordering is not a contract worth relying on.

So the fix is a wording correction, not a behavior change. Correct the false claim in the descriptors a reader uses to judge the feature: the pull request's "What" paragraph, its opencode test case, `product/specs/acp.md`, and the comments in `src/acp/internal-tools.ts` and `src/acp/launch.ts` that repeat the removal claim. Pin the spec wording with a test so the claim cannot quietly return.

## Implementation steps

1. Rewrite the first layer's description in `product/specs/acp.md`. State that opencode keeps its built-in tools in the model's list and denies every call, including `skill`, while claude starts with an empty session tool set and codex starts with its built-in tool features disabled. Keep codex's file-edit approval note and the rest of the paragraph unchanged.
2. Correct the header comment in `src/acp/internal-tools.ts` so it no longer says the model is never offered the built-in tools. State that opencode keeps them and denies calls, while claude and codex do not offer them.
3. Expand the `opencodeDenial` comment to record why the deny-all rule does not remove `skill` from the model's list: a later narrow browser-plugin rule is the last `skill` match and defeats the whole-tool removal check. Note that no supported config key removes it.
4. Correct the `acpLaunchForEntry` comment in `src/acp/launch.ts` so it says the denial refuses the harness's built-in tools rather than turning all of them off.
5. Add a spec assertion to `src/acp/internal-tools.test.ts`: find the role-connection paragraph in `product/specs/acp.md`, require it to say opencode keeps its built-in tools in the model's list and denies every call, and reject a sentence that says opencode is never offered them.
6. After the push, correct the pull request's "What" paragraph and its "Additional test cases" opencode case so they describe the same behavior, leaving every other paragraph byte-for-byte unchanged.

## Tests

- The spec assertion in `src/acp/internal-tools.test.ts` described in step 5.
- The existing opencode denial tests continue to pin the deny-all configuration merged into `OPENCODE_CONFIG_CONTENT`.

## Out of scope

- Changing opencode's behavior or adding an unconfirmed configuration key. The probe confirms no supported 2.2.5 key removes `skill` from the model's list.
- Removing `skill` by disabling opencode's bundled browser plugin, or depending on plugin rule ordering.
- Changing the role primer lines, the permission-request denial layer, or how denials are recorded.
- Rewording the pull request title or any description paragraph that does not make the removal claim.

## Verification

`./scripts/run.mjs check-diff` passes with the new spec assertion.

Manual: read the role-connection paragraph in `product/specs/acp.md` and the pull request's "What" paragraph. Neither says opencode is never offered its built-in tools. Both say opencode keeps them and denies every call.
