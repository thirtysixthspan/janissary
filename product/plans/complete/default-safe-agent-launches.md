# Default agents and harnesses to workspace and auto-approval

**Complexity: 6/10** — the parser changes are small, but defaults are exposed through command launches, the harness dialog, profiles, help, specs, and user documentation. Existing positive flags must remain compatible while explicit negative choices stay stable across every launch path.

## Goal

Launch agents and harnesses in disposable workspaces by default. Auto-approve permission prompts by default for harnesses that support it (claude and codex). Preserve opt-out control through `--no-workspace` and `--no-auto-approve`.

## Approach

Make defaults authoritative in the server parsers and profile opener. Existing `-w`/`--workspace` and `-y`/`--yes` remain accepted as explicit confirmations. A negative flag wins if both positive and negative spellings are present. Opencode continues with auto-approve off because its prompts are unsupported.

Make the harness launch dialog reflect those defaults and emit negative flags when a user unchecks a default. Profiles keep explicit `workspace` and `autoApprove` booleans authoritative; omitted fields use the same defaults as commands.

## Implementation steps

1. Update agent command parsing so workspace defaults on and `--no-workspace` opts out.
2. Update harness command parsing so workspace and supported auto-approval default on, with `--no-workspace` and `--no-auto-approve` opt-outs.
3. Update harness dialog defaults and command construction so its checkboxes and submitted command preserve explicit opt-outs.
4. Apply matching defaults to omitted harness profile booleans while preserving explicit `false`, and keep unsupported opencode auto-approval off.

## Tests

- Update agent parser cases for the new default, the workspace opt-out, and negative precedence.
- Update harness parser cases for supported and unsupported defaults, both opt-outs, and negative precedence.
- Update harness command-builder and dialog tests to cover default checked state and emitted negative flags.
- Add profile opener coverage for omitted defaults and explicit false values.

## Spec updates

- Update `product/specs/agents.md`, `product/specs/workspaced-agent.md`, `product/specs/harness.md`, `product/specs/profiles.md`, and `product/specs/keyboard-navigation.md` where they define launch defaults and flags.

## Docs

- Update `help.md` command summaries.
- Update the existing agent, workspacing, workspaced-agent, and harness pages under `documentation/user-documentation/`.
- Update profile documentation for omitted boolean defaults.

## Out of scope

- Adding auto-approval support to opencode.
- Changing sandbox implementation, workspace lifecycle, or remote provisioning.
- Changing saved explicit profile values or captured profile output.
