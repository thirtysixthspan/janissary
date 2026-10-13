# technical-debt

## ready

## development

* Preserve the existing destination until an overwrite-copy has a complete replacement ready to install.

Existing Debt: The copy-overwrite path treats survival of the source as sufficient recovery and deletes the destination before copying, although the destination can contain unrelated data that exists nowhere else. Severity: 6/10

Existing Risk: 8/10 - A disk-full, permission, or disappearing-source failure during a confirmed overwrite can destroy the previous destination and leave a partial copy while the batch reports no successful mutation.

Proposal Risk: 3/10 - A process crash or failed rollback can still leave staging or backup files requiring recovery, but the previous destination remains recoverable instead of being deleted before copying starts.

Proposal: In `src/file-navigator/filesystem.ts`, replace `copyItem`'s remove-then-copy overwrite branch with a staged replacement: copy into a unique sibling of the destination first, preserve an occupied destination under a backup name, install the completed staging entry by rename, and remove the backup only after installation succeeds. Restore the backup if installation fails, retain it and name it in the failure reason if restoration fails, and clean up incomplete staging entries without masking the original error. Keep non-overwrite conflicts and whole-directory replacement semantics intact for `performPastes` in `src/file-navigator/paste.ts`; a failed staged copy must leave the original destination unchanged so its `mutated: false` result remains truthful. `src/file-navigator/filesystem.test.ts` covers successful copies, conflicts, and overwrite success, while `src/file-navigator/paste.test.ts` covers overwrite-all and skip-conflicts behavior; neither covers a copy failure after an occupied destination has been selected. Add failure-injection cases for file and directory copies, installation failure, and failed restoration, and document the recovery guarantee in `product/specs/file-navigator-tab.md`.


* Carry the editor's stale-content precondition through remote file saves to the host that owns the file.

Existing Debt: The editor computes a baseline hash for every queued save, but the server drops it on remote saves because the filesystem port and remote write contract have no conditional-write field. Severity: 6/10

Existing Risk: 8/10 - Saving an old remote buffer can silently overwrite changes made by another editor or a remote agent because the authoritative file is never compared with the buffer's baseline.

Proposal Risk: 3/10 - An external process can still race the final comparison and atomic replacement, since the conditional save does not introduce filesystem-wide locking.

Proposal: Keep `SaveCoordinator` in `web/src/editor/save-coordinator.ts` and the overwrite prompt in `web/src/editor/useEditorFile.ts` as the client contract, and pass `expectedHash` from `saveFile` through `saveRemote` in `src/editor/save.ts` rather than checking the local cache. Add an optional precondition to `FileSystemPort.writeFile` and its local implementation in `src/file-navigator/filesystem-port.ts`, forward it in `src/file-navigator/remote/port.ts`, and extend the write-file arguments in `src/remote/protocol-frames.ts` and their validation, decoding, and dispatch in `src/remote/filesystem/operations.ts`. Compare the authoritative target's text immediately before `atomicWriteFile`, using `contentHash` and `SAVE_CONFLICT_ERROR` from `src/editor/save-conflict.ts` with the same leading-BOM handling and missing-file behavior as `src/editor/stale-save.ts`; return the conflict through the existing failure-result shape so the browser opens its current overwrite prompt and neither the cache nor the draft advances. An explicit overwrite continues to omit the precondition. Increment and document `REMOTE_PROTOCOL_VERSION` in `src/remote/protocol.ts`, because an older remote must not silently ignore this guarantee, and remove the remote-host exception in `product/specs/editor-tab.md`. Existing coverage lives in `src/editor/save.test.ts`, `src/file-navigator/remote/file-cache.test.ts`, `src/file-navigator/remote/port.test.ts`, `src/file-navigator/filesystem-port.test.ts`, `src/remote/filesystem/operations.test.ts`, and `src/remote/serve-file-navigator.test.ts`; add a remote-file-changed-after-load case that proves the original remote bytes and local draft survive, then a confirmed-overwrite case and malformed-precondition cases.


* Keep closing shell transcript writers owned and protected until their final writes have settled.

Existing Debt: The shell transcript manager equates a writer leaving its active PTY map with releasing its file, even though terminal parsing, the final row, and stream closure continue asynchronously afterward. Severity: 6/10

Existing Risk: 7/10 - An editor can replace a transcript while its final rows are still being appended to the old inode, and immediate application shutdown can skip waiting for an already-exited or released writer and lose the session's tail.

Proposal Risk: 3/10 - The existing one-second shutdown deadline can still cut off a stalled writer, but ordinary PTY exit and tab closure no longer make pending final writes invisible to their owner.

Proposal: In `src/shell/transcript/manager.ts`, retain a closing-writer record and its finishing promise when the PTY exit subscription, `release`, or a reinstall removes an entry from the active map. Use the idempotent `dispose` contract in `src/shell/transcript/writer.ts` to obtain the same completion promise on every path, retain the writer's opened path independently of the active entry until that promise settles, and have `isWriting` protect both active and closing files. Include closing promises in the bounded shutdown wait even when the active map is empty; keep the existing released-writer and per-tab failure-notification ownership checks. `src/editor/save.ts` and `src/editor/rename.ts` already consult `isWriting`, so they should gain the correct boundary without new save or rename logic. `src/shell/transcript/manager.test.ts` currently expects the guard to disappear synchronously on exit or close and tests shutdown only with active writers; update those assertions to distinguish exit from completed closure and add a held-finalization case followed immediately by manager disposal. Preserve the final-row and once-only finishing coverage in `src/shell/transcript/writer.test.ts` and the save-refusal coverage in `src/editor/save.test.ts`, and clarify the short draining period in `product/specs/shell-tab.md`.


* Bind workspace provisioning completion to its own attempt rather than to a reusable launch name.

Existing Debt: Workspace provisioning is tracked by name alone, and an earlier attempt's completion unconditionally deletes that name's pending record while credential-notice ownership is inferred only from the directory remaining referenced. Severity: 5/10

Existing Risk: 6/10 - Closing a provisioning tab and launching another under the same name can let the old promise erase the new attempt's cancellation and readiness tracking or attribute an old credential notice to the replacement tab.

Proposal Risk: 3/10 - Cancelling the clone still does not cancel every post-clone provisioning side effect, but late completion can no longer replace the newer attempt's bookkeeping or answer on its behalf.

Proposal: Give each pending provisioning record in `src/workspace/manager.ts` an attempt identity shared by `create`, `trackReady`, and `cancel`. In `trackReady`, deliver `onCredentialFailure` and delete the pending entry only if the current entry is still that attempt, rather than accepting `refs.has(handle.dir)` or deleting by name unconditionally; keep state-dirty emission after settlement and preserve retained-workspace behavior. `acquireAgentWorkspace` must continue returning the current attempt's actual readiness promise after an older attempt settles. `src/workspace/manager.test.ts` covers single-attempt readiness, cancellation, notice suppression after release, and borrowed-workspace lifetimes, but not replacement attempts under one name. Add controlled old and new promises, cancel and release the first attempt, recreate the same name, and settle the old promise both successfully and unsuccessfully before the new one; assert that the replacement remains provisioning, can still be cancelled, retains its real readiness promise, and receives no notice from the old attempt.


* Pass a local captured shell's initial working directory as process data instead of interpolated shell input.

Existing Debt: The local persistent-shell launch translates a filesystem path into a double-quoted cd command, so valid path characters are interpreted as shell syntax before the first requested command runs. Severity: 5/10

Existing Risk: 7/10 - A directory containing dollar expansion, command substitution, backticks, or a quote can launch the shell in the wrong directory or execute unintended input with that shell's permissions.

Proposal Risk: 2/10 - A directory removed between validation and process creation can still prevent launch, but its spelling no longer becomes executable shell input.

Proposal: Add an optional `cwd` to `ShellSpawnOptions` in `src/shell/index.ts` and pass it to `spawn` alongside the existing detached option. In `ShellManager.spawnFor` in `src/shell/manager.ts`, pass the already-validated `localCwd` through that option and remove the initial stdin write of `cd "${localCwd}"`; retain the fallback to the launch directory for a missing cwd and preserve shell startup flags, sandbox options, environment, and the separate remote-channel path. Keep callers that omit cwd behaving as before, including the detached remote pipe-shell call in `src/remote/serve-processes.ts`. `src/shell/manager.test.ts` currently pins a literal cd write for the fallback case, and `src/shell/index.test.ts` pins spawn and detached options; update those expectations and add paths containing quotes, dollar signs, backticks, and newlines to prove the cwd reaches process options unchanged and produces no generated stdin command. The real-shell working-directory coverage in `src/shell/unsandboxed.test.ts` does not exercise manager startup, so add a focused real-spawn startup case there and update `product/specs/shell.md` to describe the launch behavior.


* Bound captured shell output while continuing to recognize completion markers after the retention limit.

Existing Debt: Captured shell execution accumulates and repeatedly scans the entire command output in one string, while the transcript's entry-count limit cannot bound the size of that single running entry. Severity: 6/10

Existing Risk: 8/10 - One verbose or indefinitely streaming captured command can exhaust server memory and repeatedly rebuild oversized state snapshots, disrupting every tab in the session.

Proposal Risk: 3/10 - A continuously noisy process still consumes I/O and processing time, and output beyond the retained limit is intentionally unavailable, but its retained output and marker-search memory remain bounded.

Proposal: Extract a bounded output-and-marker accumulator beside `src/shell/index.ts` and use it in `executeShellCmd` instead of `outputBuffer += chunk` plus a whole-buffer `indexOf` on every chunk. Set a concrete per-command retention budget, expose a clear truncation note to progress and completion callbacks, and keep a small rolling suffix for delimiter recognition so a marker split across chunks or arriving long after the cap still completes exactly once. Continue draining stdout and stderr after retention stops; do not detach early or return an apparently complete command while it is still running. Apply the same bounded-marker approach to `queryShellPwd` with a retained last-path answer so unrelated background output cannot grow its buffer without limit. Preserve ordinary trimming, `SHELL_EXITED_NOTE`, listener cleanup, and the serialized command-then-pwd sequence in `src/shell/manager.ts`. `src/shell/index.test.ts` covers accumulated small output, normal sentinels, and shell exit, and `src/shell/manager.test.ts` covers serialization and transcript updates; add oversized chunks, split sentinels after truncation, stderr overflow, and exit-before-sentinel cases, and check that the bounded final output still reaches consumers covered by `src/capture/execute-and-capture.test.ts`. Document the truncation boundary in `product/specs/shell.md` and `product/specs/transcript.md`.


* Give editor save and draft-sync requests bounded waits through the shared RPC exchange.

Existing Debt: Pending browser RPCs have no request deadline or cancellation ownership and settle only on a reply, a send exception, or connection teardown, while editor recovery assumes each send eventually reports success or failure. Severity: 5/10

Existing Risk: 6/10 - A request whose handler never answers while the socket remains open can indefinitely block the editor's save queue or draft-sync pending flag, leaving later saves or monitor-visible edits waiting without feedback.

Proposal Risk: 3/10 - A timed-out disk save may still complete on the server, so the editor must report an unknown outcome and preserve its buffer rather than assume the write did not occur.

Proposal: Add an optional per-request deadline to `RpcExchange.request` in `web/src/shared/ws/rpc-exchange.ts`, store its timer with the pending callback, and clear it on every `settle` and `drain` path before invoking callbacks. Forward the option through `JanusClient.request` in `web/src/shared/ws/ws.ts` and use explicit bounded policies in its `saveFile` and `editorSync` wrappers, keeping unrelated long-running RPCs outside this first increment. A deadline must settle once with a nonempty error and remove the callback; a late reply must be ignored, and a timed-out mutation must never be automatically replayed. Keep the failure visible through `web/src/editor/useEditorFile.ts`, and let `DraftSync` in `web/src/editor/draft-sync.ts` apply its existing bounded retry policy only to transient draft replacement. Existing disconnect, disposal, late-reply, and wake-probe behavior is covered by `web/src/shared/ws/ws.test.ts`, and editor retry and ordered-save behavior by `web/src/editor/draft-sync.test.ts`, `web/src/editor/save-coordinator.test.ts`, and `web/src/editor/useEditorFile.test.ts`; add fake-timer coverage for an open socket that never replies, deadline cleanup, a reply racing expiration, and a later queued save being released by the timeout. Update `product/specs/editor-tab.md` and `product/specs/websocket-rpc.md` with the unknown-save-outcome behavior.

## deferred


## declined
