# Cap Nested Agent Skills and Command Grants

**Complexity: 8/10** — the change crosses canonical command dispatch, skill snapshot resolution, nested run ownership, and cleanup races.

## Goal

Ensure a nested agent cannot select skills or command grants outside the immutable policy captured by its parent, and ensure parent cleanup cancels and awaits every child run.

## Approach

Tag resolved skills with their source category so policy matching compares source, name, and captured instructions rather than filesystem paths that differ between execution workspaces. Carry trusted run identity only in server-created invocation contexts. For a nested launch, resolve the requested snapshot, reject any skill not present unchanged in the parent snapshot, and intersect child grants with the parent's effective grants. Register each nested operation with its parent so parent cleanup aborts and waits for it.

## Implementation steps

1. Use the existing server-created invocation run identity and signal to establish trusted parentage; add skill source category to workspace-first resolution and remote snapshot decoding.
2. Enforce parent skill and grant policy in `src/commands/agent.ts`, deriving the parent only from a live server-owned agent run identity.
3. Register child-run cancellation and completion as parent-owned cleanup in `src/agent/run.ts`, using `src/agent/manager.ts` to terminate the child run.
4. Add coverage in `src/agent/command-tools.test.ts`, `src/commands/agent.test.ts`, and `src/agent/manager.test.ts` for trusted identity propagation, skill widening rejection, grant intersection, and awaited child cleanup.
5. Update `product/specs/agent-command.md` with nested policy and cleanup behavior.

## Tests

- An `agent` grant cannot select a skill absent from the parent's snapshot or a same-named skill with a different source or instruction contents.
- A matching nested skill cannot widen effective command grants, and denied commands never reach canonical dispatch.
- Only a trusted live parent run identity establishes nested ownership.
- Parent termination aborts and awaits child cleanup; cleanup remains idempotent when the child has already settled.
- Diff-scoped lint, typecheck, and tests pass after each implementation step.

## Out of scope

- Changing task resolution, remote execution semantics, or non-agent command grants.
- Altering workspace/provider tools or the general filesystem execution policy.
- Working any other entry in `product/backlog/pull-request.md`.
