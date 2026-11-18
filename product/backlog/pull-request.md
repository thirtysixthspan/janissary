<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Deliver the plan's requirement that the protocol version comment name run-clone as a later extension of the single unreleased version.

Existing Issue: The comment above REMOTE_PROTOCOL_VERSION documents version 44 only in terms of acp-session-started and never names the run-clone frames and workspace selectors that the plan says extend this same unreleased version and comment without another bump, so the single-increment rule is not recorded where a future implementer would meet it. Severity: 5/10

Existing Risk: 5/10 - An implementer of the later run-clone or workspace-selector frames, finding no note that they share version 44, bumps the constant again and breaks the exact-version handshake between peers of the same unreleased feature set.

Proposal Risk: 2/10 - The work is a comment-only edit with no runtime effect; the only care needed is to describe run-clone and selectors as future extensions without claiming their frames or a version bump already exist.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2064 "name run-clone in the protocol version comment". Extend the explanatory comment above REMOTE_PROTOCOL_VERSION in src/remote/protocol.ts so it states that version 44 opens the feature's single unreleased protocol version and that the later run-clone frames and workspace-selector frames extend this same version and comment without another increment; phrase it so those later frames are clearly not yet implemented, staying consistent with product/specs/remote-server.md, which must keep claiming no run-clone or selector support. Do not change the constant or any handshake logic: the pinned literal test at src/remote/protocol.test.ts already asserts 44, and the exact-version handshake and parked-peer refusal in src/remote/serve-detach.ts must keep passing untouched.
