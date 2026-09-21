# Remote harness detach lifecycle

Issue: detaching a harness tab correctly updates the sessions tab, but the harness tab launches then immediately closes. the row in the sessions tab disappears.

Complexity: 3/10

## Goal

Detach a remote harness without allowing its tab-close cleanup to send a process-kill frame before the SSH transport ends.

## Approach

- Add a remote-channel disconnect operation that first makes the local channel unavailable, then closes its transport.
- Use that operation for deliberate detachment. The tab-close sweep can then dispose local shell and PTY handles, but every later frame is ignored locally and the remote peer only observes its transport loss.
- Retain ordinary channel close and termination behavior.

## Tests

- `src/remote/channel.test.ts` verifies disconnect blocks later process-control frames while closing the transport.
- `src/remote/resume.test.ts` verifies remote detachment uses the disconnect lifecycle.

## Out of scope

- Reattach behavior, normal tab closing, and remote process termination.

## Specs / docs

- `product/specs/sessions-tab.md` already defines detach as leaving remote processes running; clarify that behavior. No public documentation currently describes this lifecycle.
