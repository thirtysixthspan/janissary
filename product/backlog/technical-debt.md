# technical-debt

## ready


## development

* Drive the remote frame encoder's base64 fields from one declared table so a new frame with a binary payload cannot silently bypass encoding.

Existing Debt: The remote frame union and its admitted-type maps are compile-checked, but the encoder that base64-encodes payload bytes is a hand-written chain of frame-type checks that nothing ties back to the union. Severity: 6/10

Existing Risk: 6/10 - A new or edited frame type carrying a binary field can be sent with raw control bytes or embedded newlines, which breaks line framing on the SSH channel and makes the far side reject the frame as malformed or stray.

Proposal Risk: 2/10 - Encoding still depends on field names, but a new binary field is added to the same declaration the compiler checks, so an omitted encoder entry becomes a build error rather than a runtime framing fault.

Proposal: `src/remote/protocol.ts` defines `toWire` as a chain of `if (frame.type === ...)` branches calling `encodeText` on fields such as `data`, `blocks`, `text`, `command`, `result`, `display`, `capture` and `output`, while `src/remote/protocol-frames.ts` separately declares `ClientFrame`/`ServerFrame` and the compile-complete `CLIENT_FRAME_TYPES`/`SERVER_FRAME_TYPES` maps. Move the "which fields of which frame are base64" fact into `src/remote/protocol-frames.ts` as a keyed declaration covering every `RemoteFrame['type']`, then reduce `toWire` to one pass over that declaration. Preserve the conditional cases that encode only when a field is present (`acp-turn` with `phase === 'end'`, `acp-tool-result` with `output !== undefined`, `gate-event` and `resume-event` with `capture !== undefined`, `capture-reply` with `text !== undefined`) as explicit entries rather than dropping them. `src/remote/protocol.test.ts` round-trips frames through `encodeFrame`/`decodeFrame` and checks the admitted-type maps; add a case for every frame whose fields appear in the new table so a missing or wrong encoding fails there.


* Type the remote filesystem reply's result by operation instead of `unknown`, so the wire frame and its validation table are one contract.

Existing Debt: The `filesystem-reply` frame declares `result?: unknown` and its decoder copies that value through untouched, while the real per-operation shape lives only in a separate hand-written decoder table. Severity: 6/10

Existing Risk: 5/10 - A reply whose result disagrees with its operation, or a field renamed in one place only, reaches the operation decoder as an unchecked value and fails late with a generic error, or is silently accepted when the decoder is too loose.

Proposal Risk: 2/10 - The per-operation guards still validate at runtime, but the frame type no longer admits an arbitrary result, so an operation whose result shape is never declared fails to compile.

Proposal: In `src/remote/protocol-frames.ts` the `filesystem-reply` member carries `result?: unknown`, and `src/remote/frame/decode-filesystem.ts` `decodeReply` returns `record.result` with no validation. The actual shapes live in `src/remote/filesystem/result-decoders.ts` `resultDecoders`, reached through the `as RemoteFilesystemOperationResult<K>` cast in `src/remote/filesystem/operations.ts` `decodeFilesystemResult`. As a first increment, define one union type in `src/remote/filesystem/operations.ts` over every decoder's return type, declare the frame's `result` as that union instead of `unknown`, and have `decodeReply` run the value through a guard derived from `resultDecoders` before emitting the frame, dropping the cast once the frame type carries the shape. `src/remote/filesystem/operations.test.ts` already decodes a valid result for every operation and checks rejections; `src/remote/protocol.test.ts` round-trips a file-contents reply using `as { result: { content: string } }` to read the field, so replace that cast with the now-typed field and add a case where the result does not match any declared shape.


* Validate the shell marker nonce in one shared guard used by the zsh hooks, the client shell plugin, and both remote frame decoders.

Existing Debt: The same 32-hex nonce format is reimplemented in four places, three with identical code and one as an inline regex with no comment, so a format change has to be found and applied in all four. Severity: 5/10

Existing Risk: 5/10 - If the nonce format changes or tightens where it is minted, a decoder still accepting the old shape can admit a spoofed marker from a remote peer or reject a legitimate one, and the inline copy in `decode-sessions.ts` has no invalid-case test.

Proposal Risk: 2/10 - All four call sites share one predicate, so a format change is a single edit; the remaining risk is a future call site that bypasses the guard, which the cross-module import makes visible.

Proposal: `src/shell/zsh-startup/script.ts` `isZshHookNonce` and `src/plugins/shell/shared.ts` `isShellMarkerNonce` are byte-identical `/^[0-9a-f]{32}$/` checks, and the former's comment explains it keeps a copy because the latter lives in a module the client imports. `src/remote/frame/decode-lifecycle.ts` `decodeSpawn` calls `isZshHookNonce` for `shell.nonce`, but `src/remote/frame/decode-sessions.ts` `decodeProcessState` reimplements the regex inline for the same field on `session-state-result`. Extract the guard into a host-neutral pure module that both server and client may import, such as `src/value-guards.ts` where other shared guards live, and import it at all four sites, keeping thin re-exports only where a published signature needs one. `src/remote/protocol.test.ts` rejects an invalid `spawn` nonce but uses only a valid nonce for `session-state-result`; add an invalid-nonce case there so both frame paths are pinned.


* Replace the positional argument chains through the plugin guarded-call path with one options object so optional handlers cannot be swapped between call layers.

Existing Debt: `invokePlugin` and `createPluginContext` take long positional tails whose optional string and callback parameters appear in different orders and are threaded through `undefined` placeholders, so the forwarding seam has no types expressing which argument is which. Severity: 6/10

Existing Risk: 6/10 - Swapping two same-typed optional arguments between those functions typechecks and silently misroutes the failure-disabling callback or the adopted PTY id, turning a plugin failure into a silent one or attaching a terminal to the wrong tab; no `invoke.test.ts` covers the forwarding.

Proposal Risk: 2/10 - Named fields make every argument's meaning explicit at each call site while the guarded call itself stays in `guardPluginCall`; the residual risk is passing the right value under the wrong name, which a named type makes reviewable.

Proposal: `src/plugins/invoke.ts` `invokePlugin` ends with `answeringLabel?, disable?, adoptPtyId?` and forwards eleven positional arguments into `src/plugins/context.ts` `createPluginContext`, whose tail is `answeringLabel?, deadline?, deferred?, adoptPtyId?, disable?` — `adoptPtyId` and `disable` are in opposite positions. Callers in `src/plugins/host.ts` pad the gap: the constructor's `invoke` port and `reattach` pass `undefined` placeholders. Change both functions to take a single trailing options object typed as a named interface carrying `openRequests`, `answeringLabel`, `deadline`, `deferred`, `adoptPtyId` and `disable` by name, and update the recursion in `invokePlugin`'s `deferred.invoke` and the two `host.ts` call sites together. Add `src/plugins/invoke.test.ts` asserting that `disable` and `adoptPtyId` survive the deferred call, which no current test checks; `src/plugins/host.test.ts` and `src/plugins/context.test.ts` cover the surrounding behavior and must keep passing.


* Make the client tab view a discriminated union so view payloads are narrowed by the discriminant instead of two hand-mirrored guard files.

Existing Debt: The wire tab view and the server tab record both declare `view` and their five payloads as independent optional fields with a prose-only "present only when" invariant, so each side hand-writes the same five predicates and nothing ties the two sets together. Severity: 6/10

Existing Risk: 5/10 - A payload missing for the view it claims, or a guard updated on one side only, renders an empty tab body or throws inside a component, and the duplicate guard sets can drift with no compile or test signal.

Proposal Risk: 3/10 - Narrowing by the discriminant removes the hand-written client checks, but the server's internal tab record still carries optional payloads and keeps its own guards until a later change, so an internal tab can still violate the invariant.

Proposal: `src/protocol/tab.ts` `TabView` declares `view?: 'plugin' | 'harness' | 'editor' | 'monitor' | 'files' | 'notifications'` alongside independent optional `plugin`, `harness`, `editor`, `monitor` and `files` fields whose comments state the invariant in prose. `web/src/shared/tab/view-guards.ts` calls itself "the client mirror" of `src/tab/view-guards.ts`, and both repeat five `view === ... && payload !== undefined` predicates. As a first increment, make `TabView` a union of one member per view kind with shared presentation fields factored into a base, update `buildTabView` in `src/tab/view.ts` to produce the narrow member, and replace the five client guards with direct narrowing on `view`, leaving the mirror reduced to helpers such as `indexedTabs`. Leave `src/tab/types.ts` `Tab` and `src/tab/view-guards.ts` for a separate change, since the server record is assembled over a tab's lifetime and cannot be built in one narrow step. `web/src/shared/tab/view-guards.test.ts` and `web/src/App.test.tsx` pin current guard behavior and must keep passing.


* Resolve a plugin's own tabs through one helper instead of four hand-rolled scans using two different lookup idioms.

Existing Debt: The "tabs owned by this plugin" scan is repeated across four capability modules, and one file resolves the same instance key two different ways, so the definition of ownership has no single owner. Severity: 5/10

Existing Risk: 4/10 - A change to how a plugin tab is identified must be applied in four places; missing one lets a plugin act on another plugin's tab or fail to find its own.

Proposal Risk: 2/10 - One helper centralizes the filter, but callers still choose between key-based and index-based results, so an incorrect choice remains possible at each site.

Proposal: `src/plugins/notifications.ts` `ownedTabs`, `src/plugins/own-tab-capabilities.ts` `ownTabKeys` and `src/plugins/line-capabilities.ts` `ownTabLabels` each filter `managers.tab.tabs` on `tab.plugin?.id === declaration.id`, while `own-tab-capabilities.ts` `dockTab` and `closeOwnTab` hand-roll a `findIndex` over the same predicate even as `setUnread`, `setBusy` and `snapshotTab` call `managers.tab.pluginTabByInstanceKey`. Add one exported helper beside `pluginTabByInstanceKey` in `src/tab/lookup.ts` that returns the owned tab and its index for a declaration id plus optional instance key, and route all four scans and both `findIndex` sites through it. Extend `src/plugins/context.test.ts` and `src/plugins/notifications.test.ts` with a case registering tabs from two plugins and asserting every capability sees only its own; those suites currently test each copy independently, so drift is invisible.


* Give plugin capabilities manager methods for the tab fields they write instead of assigning into the host tab record directly.

Existing Debt: Several plugin capabilities write host-owned `Tab` fields in place and remember to emit a dirty state broadcast themselves, mixing host record ownership with capability logic. Severity: 5/10

Existing Risk: 5/10 - Writing `tab.plugin.busy`, `tab.pageSnapshot` or `tab.remote` outside their owners can leave the view stale when a writer forgets the matching broadcast, or skip the teardown and release bookkeeping the owning manager performs.

Proposal Risk: 2/10 - The writes move behind manager methods that own both mutation and broadcast, but capabilities still have to call the right method, which a typed method name keeps visible in review.

Proposal: `src/plugins/own-tab-capabilities.ts` `setBusy` assigns `tab.plugin.busy = busy` and emits `messageBus.emit('state', { type: 'dirty' })` by hand, and `snapshotTab` assigns `tab.pageSnapshot`; `src/plugins/remote-join-capabilities.ts` assigns and deletes `tab.remote` around `managers.remote.attach`/`release` with two more manual broadcasts; `src/plugins/launch-tab.ts` and `src/plugins/launch-tab-remote.ts` also write `tab.plugin.busy`. Those fields are declared in `src/tab/types.ts` and owned by the tab and remote managers. Add methods on `TabManager` and `RemoteManager` that perform each write with its broadcast, leaving the enable and deadline gating in the capability, then call them from the capability modules and drop the direct assignments and local `messageBus` imports. Keep `src/plugins/context.test.ts`, `src/plugins/snapshot-tab.test.ts` and `src/plugins/remote-join-capabilities.test.ts` as the behavior contract.


* Delete the unused file-capabilities group and the test that asserts both it and the live implementation.

Existing Debt: A whole capability module is dead production code whose helpers duplicate the live ones and have already drifted from them, while a test keeps both implementations alive. Severity: 4/10

Existing Risk: 4/10 - A future fix to topic authorization or editor opening applied only to the live module leaves the dead copy wrong, and the test that runs both hides the drift by treating the dead behavior as an expected result.

Proposal Risk: 1/10 - Removing the module and its duplicated assertions leaves one implementation and one test path; the only residual risk is a later caller reaching for the old import, which a missing module makes an immediate compile error.

Proposal: `src/plugins/file-capabilities.ts` exports `fileCapabilities`, `requireDeclaredTopic` and `topicActionCapability`; no production module imports `fileCapabilities` — the only importer is `src/plugins/topics.test.ts`, which builds a `fileContext` and asserts the same topic-action behavior as the live `createPluginContext`. The live `requireDeclaredTopic` and `topicActionCapability` are in `src/plugins/context.ts`, and `projectFileList`/`openInEditor` in the dead module duplicate `src/plugins/project-capabilities.ts` while lacking its `root` result and `withRunAllocation` wrapping and calling `managers.openFile.edit` directly. Delete `src/plugins/file-capabilities.ts`, remove the `fileContext` setup and its parallel assertions from `src/plugins/topics.test.ts`, and rely on `src/plugins/context.test.ts` and `src/plugins/project-capabilities.test.ts` for the live behavior. A completed plan note in `product/plans/complete/04-runscripts-topic-and-actions.md` already records that nothing imports this module.


* Give the picker-population hook an options object and a colocated test instead of eleven positional parameters.

Existing Debt: A hook with eleven positional parameters of overlapping optional string and callback types fans its arguments into two further positional hooks, and its composition of two result objects has no direct test. Severity: 4/10

Existing Risk: 4/10 - Adding or reordering a parameter silently shifts meaning at the single call site, and a key collision in the merged result would override one picker's handlers without any test noticing.

Proposal Risk: 2/10 - Named fields make each argument explicit and a focused test pins the merge, but the two delegate hooks keep their own positional signatures for now, so the same class of mistake remains one layer down.

Proposal: `web/src/pickers/usePopulatePickers.ts` takes eleven positional parameters, forwards them to `useTaskPicker` (seven parameters) and `useProfilePicker` (five) in `web/src/pickers/useTaskPicker.ts` and `web/src/pickers/useProfilePicker.ts`, then returns `{ ...task, ...profile }`; `web/src/pickers/usePickerOverlays.ts` is the only caller and passes them by position. Convert the hook to one named options object, update that call site, and add `web/src/pickers/usePopulatePickers.test.ts` asserting the merged result keeps both delegates' handlers and that the profile half wins on any shared key, or change the merge to an explicit object if no overlap is intended. `web/src/pickers/useTaskPicker.test.ts` and `web/src/pickers/useProfilePicker.test.ts` cover the delegates and must keep passing.


* Share one algorithm for choosing the tab left visible in the source pane across the split and arrange paths.

Existing Debt: Two tab-movement paths independently decide which tab remains visible in the vacated pane using different helper chains, and a third module forwards to one of them unchanged. Severity: 5/10

Existing Risk: 4/10 - The two algorithms can pick different survivors for the same layout, so the same move leaves a different tab selected depending on whether it came from a split or a pane arrangement, with no test comparing them.

Proposal Risk: 2/10 - One helper makes both paths agree, but the surrounding state updates still assign `activeTab`, `secondaryTabLabel` and focus separately, so divergence can reappear in those assignments.

Proposal: `src/tab/split.ts` `moveToOtherPane` picks the survivor with `restorableLabel(...) ?? restorableLabel(...) ?? historyLabel(...) ?? nearestLabel(...)`, while `src/tab/arrange.ts` `movePane` re-decides with `visibleInPane(...) ?? recentLabel(...)`; `src/tab/split-selection.ts` `moveTabToOtherPaneSelection` is a one-line passthrough to `moveToOtherPane`. Extract one shared selection helper taking the post-move tab list, source pane, candidate labels and focus history and returning the survivor, call it from both `moveToOtherPane` and `movePane`, and import the canonical function directly at the passthrough's call sites. `src/tab/split.test.ts`, `src/tab/arrange.test.ts` and `src/tab/split-selection.test.ts` cover each path separately; add one case driving the same starting layout through both entry points and asserting the same `secondaryTabLabel`.


* Read candidate files through one policy-carrying reader so search, grep, and the search plugin skip the same secret and symlinked paths.

Existing Debt: Three workspace text readers independently decide which files may be read, and only one applies the project's secret-path and real-target policy, so that policy is not a property of reading a candidate file. Severity: 6/10

Existing Risk: 7/10 - The navigator search and the search plugin will read a secret or symlink-escaped file that grep refuses, putting token contents into a result list where the local-first policy expects them never to appear.

Proposal Risk: 2/10 - All three readers share one policy, but a caller could still inject a raw reader; the injectable `CandidateReader` seam in `searchText` must keep defaulting to the shared one.

Proposal: `src/file-grep/read-candidate.ts` `readCandidate` resolves the path strictly under the real root, calls `isSecretPath` and `createRealTargetCheck`, checks each ancestor with `lstat`, then `realpath`s the file and compares it to the resolved path before reading. `src/file-navigator/search-text.ts` `readCandidate` only `stat`s the size and scans the leading bytes for NUL; `src/plugins/search/scan.ts` `readableText` does the same through its `Runtime` size/read pair. Neither applies `isSecretPath`, `createRealTargetCheck`, nor a `realpath` equality check. Extract one policy-carrying reader (beside `createCandidateReader` in `src/file-grep/read-candidate.ts`, or in `src/file-read/policy.ts`) that takes the real root and a signal and owns the shared size, binary and policy decision, then call it from all three pipelines, keeping `searchText`'s injectable `CandidateReader` for tests but defaulting it to the shared reader. `src/file-grep/read-candidate.test.ts` already covers secret paths, links and home-secret roots; port those cases into a test of the shared reader and add the same assertions to `src/file-navigator/search-text.test.ts` and `src/plugins/search/scan.test.ts`, which today test only size and binary refusal.


* Use one case-sensitivity rule for include and exclude globs so workspace search and file glob agree on which paths they select.

Existing Debt: Two path-selection engines use different glob implementations with opposite case semantics, so the same include pattern selects different files depending on which command runs. Severity: 5/10

Existing Risk: 5/10 - On macOS and Windows `file grep --include '*.TS'` silently matches lowercase files while `file glob '*.TS'` does not, so a user can miss matches or act on the wrong set without any error.

Proposal Risk: 2/10 - One matcher is shared by both paths, but the commands still normalize patterns differently, so an anchored or directory-like pattern may need its own normalization pass to keep the two pipelines identical.

Proposal: `src/search/filter-paths.ts` `selects` calls `path.matchesGlob`, which the comment in `src/file-glob/match.ts` says folds case on macOS and Windows with no way to turn it off; `createGlobMatcher` in that file deliberately uses `minimatch` with `nocase: false`, and also applies `normalizeGlobPattern` and the complexity cap from `src/file-glob/pattern-limits.ts`. Route include/exclude matching in `filterPaths` through one shared case-sensitive matcher built on the same minimatch options and complexity guard, keeping only the behavior unique to `filterPaths`: the `**/` retry for patterns without a slash and the directory-prefix rule for non-globs. `src/file-glob/match.test.ts` asserts case sensitivity on every host while `src/search/filter-paths.test.ts` has no case test; add a cross-pipeline case asserting both engines select the same paths for a mixed-case pattern, and keep the existing pattern-limit tests passing.


* Share one path canonicalization and case-folding rule across the reader, writer, and patch view so the same file has one key everywhere.

Existing Debt: The same canonical-path and case-insensitive-key facts are reimplemented with different functions in the read, write, and patch modules, so one file can carry different keys in different subsystems. Severity: 6/10

Existing Risk: 6/10 - On a case-insensitive volume `realpathSync.native` preserves the on-disk spelling while `realpathSync` may not, and NFKC folding differs from plain lowercasing, so a file read under one key can be written or patched under another and produce a duplicate file or a stale edit.

Proposal Risk: 2/10 - One helper defines both facts, but callers still choose whether a given path is case-sensitive, so a wrong choice remains possible at each site.

Proposal: `src/file-write/target.ts` sets `const canonicalPath = realpathSync.native` and `src/file-patch/view.ts` `resolveCanonicalRoot` calls `realpathSync.native`, while `src/file-read/read.ts` `loadBytes` calls plain `realpathSync`. For the case key, `src/file-patch/view.ts` `foldedPlace` and `planKey` use plain `.toLowerCase()`, while `src/file-read/policy.ts` `foldSegment` uses `.normalize('NFKC').toLowerCase()` and the secret-anchor checks use lowercase again. Add one shared helper, for example `src/file-read/canonical.ts`, exporting a canonical-path function and a case-fold function, and use it in `loadBytes`, `target.ts`, `view.ts`, and `policy.ts`. `src/file-write/target.test.ts`, `src/file-patch/view.test.ts`, `src/file-read/read.test.ts` and `src/file-read/policy.test.ts` each test only their own module; add one cross-module case that reads, writes, and patches the same mixed-case path and asserts one canonical key, noting that the decisive case-insensitive assertion in `view.test.ts` is currently skipped on volumes that ignore case.


* Map filesystem failures to their real reasons instead of reporting every read error as a missing file.

Existing Debt: The workspace reader wraps every filesystem failure in one "File not found" string even though a shared reason mapper already distinguishes permission, symlink, directory and size failures. Severity: 5/10

Existing Risk: 5/10 - A permission error or a symlink loop is reported as a missing file, so a user retries a path that exists and cannot tell the real cause, and no test can distinguish the cases.

Proposal Risk: 2/10 - Errors map to specific reasons, but the mapper still covers a fixed set of codes and an unknown code falls back to a generic reason, so a new failure mode needs a mapping entry.

Proposal: `src/file-read/read.ts` `loadBytes` catches every exception from `realpathSync`, `statSync` and `readFileSync` and returns `'File not found'`. `src/file-navigator/file-operation-result.ts` `fileOperationReason` already maps error codes to specific strings, and `src/file-read/policy.ts` `classifyStats` covers directory and size cases. Replace the catch-all with code-aware mapping through `fileOperationReason`, keeping the lexical-policy and real-target failures returned as they are today. `src/file-read/read.test.ts` covers missing files and binary content but not permission or I/O codes; add cases with a code-bearing error such as `EACCES` and `ELOOP` asserting the mapped reason, and keep the existing missing-file case for `ENOENT`.


* Guard the undo/redo replay so a partial success cannot pop a stack that does not match the step being replayed.

Existing Debt: The shared replay protocol pops the source history stack unconditionally whenever any item succeeds, without checking that the stack's top is the step actually being replayed. Severity: 5/10

Existing Risk: 5/10 - A replay whose stack was already changed by another action drops the wrong entry and rebuilds a history that no longer matches the files, so a later undo or redo restores the wrong set of changes.

Proposal Risk: 2/10 - The pop becomes tied to the replayed step, but the protocol still keys successful and failed items by object identity, so duplicate item objects can collapse into one outcome.

Proposal: `src/file-navigator/replay-protocol.ts` `applyReplayProtocol` collects `successful` and `failed` keyed by item identity and, when `successful.size > 0`, calls `options.fromStack.pop()` with no check that the top entry corresponds to `options.groupItems`. Add a guard, or pass the expected step in as a parameter, so the pop happens only when the top stack entry is the replayed group, and keep the remaining-step push and the `toStack` push inside that same guarded branch. `src/file-navigator/moves.ts` `applyStackMove` and `applyStackPaste` supply the stacks and should pass the step identity if the guard needs it. There is no `replay-protocol.test.ts`; `src/file-navigator/moves.test.ts` covers the normal split path but not an empty or mismatched `fromStack`, so add a direct case there or colocate a focused test asserting the stack is untouched on mismatch.


* Parse send and queue labels with the same quote-aware tokenizer the tab commands use, so a spaced tab label can be addressed everywhere.

Existing Debt: Two commands split their arguments on whitespace while the tab command uses the shared quote-aware reader, so the same tab label is addressable in one command family and not another. Severity: 5/10

Existing Risk: 5/10 - A tab whose label contains a space can be renamed and moved but a `send` or `queue` to it silently targets a different tab or reports an unknown tab, losing the command the user typed.

Proposal Risk: 2/10 - Both parsers then use the shared tokenizer, but completion for those commands still uses the unquoted word completer, so the UI can suggest a bare label with spaces that the parser now reads as two tokens.

Proposal: `src/commands/send.ts` `parseSendCommand` and `src/commands/queue.ts` `parseQueueCommand` each strip the verb and call `body.split(/\s+/)` to take the first token as the label. `src/commands/parse-tab.ts` `readWords` already tokenizes through `readToken` in `src/command/quoted-token.ts`, and `src/completion/target-handlers.ts` `formatTarget` quotes labels containing whitespace. Replace both naive splits with the shared token reader, exporting `readWords` from `parse-tab.ts` if needed, while keeping the existing usage errors for a missing label or text. In the same change switch `completeSendTarget` in `src/completion/target-handlers.ts` from `completeWord` to the quoting completion path so suggestions match what the parsers accept. `src/commands/send.test.ts`, `src/commands/queue.test.ts` and `src/completion/handlers.test.ts` cover plain labels; add a quoted multi-word label case to each parser suite and to the completion suite.


* Remove the re-dispatch fallback for unavailable commands so a system-initiated command reports why it cannot run instead of becoming an unknown command.

Existing Debt: The command executor handles an unavailable command by sending the input back through the normal dispatcher, which applies the same availability filter and therefore cannot match it a second time. Severity: 6/10

Existing Risk: 5/10 - The `resetAcp` client message calls `executeCommand('ask-reset', 'ask reset', ...)`, and when ACP is unavailable the user sees an unknown-command line instead of a reason, so a normal capability refusal reads like a broken client.

Proposal Risk: 2/10 - The unavailable branch appends a clear refusal, but availability is still a predicate evaluated at dispatch time, so a command could become available or unavailable between the check and the run.

Proposal: `src/command/manager.ts` `executeCommandWithContext` calls `findCommand`, then for `cmd.available?.(...) === false` calls `this.run(command, label, index)` and returns. `this.run` classifies through `resolveInTab` in `src/command/resolve-in-tab.ts`, which filters on the same `available` predicate, so the second pass cannot resolve the command. Replace the re-dispatch with an explicit refusal line appended through `managers.tab.appendForInvocation`, in the style of the `refuseDisabledCommand` branch just above it, naming the command and saying it is unavailable in this tab. `src/message/tabs.ts` `resetAcp` is the concrete caller and `src/commands/ask-reset.ts` supplies `available = acpAvailable`; `src/command/manager.test.ts` covers the disabled-policy refusal but not this branch, so add a test with `ask-reset` and ACP unavailable asserting the refusal text and that no unknown-command line is emitted.


* Clear the in-flight suggestion state when a request fails so one rejected editor query cannot disable the suggestion surface for the rest of the session.

Existing Debt: The suggestion hook sets a firing flag before a request and clears it only in the success callback, so a rejected request leaves the flag set and every later request is refused by the same guard. Severity: 6/10

Existing Risk: 6/10 - A dropped request or a server error leaves `firingRef` true and `firingLine` visible, so the in-editor suggestion surface silently stops responding for the rest of the tab's life with no error shown.

Proposal Risk: 2/10 - The flag is cleared on every settlement, but a failed request still produces no visible error text, so the user sees the surface go idle again without knowing the query failed.

Proposal: `web/src/editor/useEditorSuggest.ts` `fireOnLine` sets `firingRef.current = true` and `setFiringLine(queryText)`, then attaches only a `.then()` to `client.request`; `closeQueryLine` sets `firingCancelledRef` while a request is in flight, and that flag is also cleared only inside `.then()`. Add a rejection handler, or a `.finally()` combined with the existing success logic, that clears `firingRef`, `firingLine` and `firingCancelledRef` on any settlement, and surface a short failure line through the existing `noSuggestionLine` state. The persona request in the same file has the same missing rejection path and should get the same guard. `web/src/editor/useEditorSuggest.test.ts` covers success, empty hunks, close-while-in-flight and the second-request guard but has no rejected request; add one asserting a subsequent `fireOnLine` proceeds after a rejection.


* Detect a stuck permission gate from the gate itself rather than byte-for-byte screen equality so a redrawing terminal cannot keep auto-approval looping.

Existing Debt: The stuck guard counts repeats by whole-screen text equality, so any unrelated redraw resets the counter even when the same gate is still on screen. Severity: 6/10

Existing Risk: 7/10 - A spinner frame, clock, or task panel changing around a gate the agent cannot clear resets `identicalApprovals`, so the stand-down notification never fires and the approver keeps sending keystrokes indefinitely.

Proposal Risk: 3/10 - The counter tracks the gate rather than the whole frame, but detection still depends on the per-harness gate detector, so a gate that detector misses remains unguarded.

Proposal: `src/harness/auto-approve.ts` `HarnessAutoApprover.onCapture` computes `repeat = capture.text === this.lastApprovedText` and uses it both for the `MAX_IDENTICAL_APPROVALS` stand-down and for the counter, storing the entire frame in `lastApprovedText`. Derive the repeat key from the detected gate instead: `detectPermissionGate` is already called just above, so use it to select the matching gate lines or a normalized region of the capture, store that as `lastApprovedText`, and keep the existing notification and counter behavior. `src/harness/auto-approve.test.ts` covers byte-identical repeats and a switch to a different gate; add a case repeating the same gate with a cosmetic change elsewhere on screen and assert the stand-down fires after the same number of approvals, keeping the existing non-gate reset test.


* Store each suggestion hunk together with its resolved flag so an out-of-range hunk index cannot crash the editor.

Existing Debt: Pending suggestions keep hunks and their resolved flags in two parallel arrays that are re-paired by position in the renderer and the accept path, with no bound tying an incoming index to the array length. Severity: 5/10

Existing Risk: 5/10 - An index that no longer matches the current hunks passes the `resolved[index]` check as `undefined` and reaches `applyHunk` with an undefined hunk, which dereferences `hunk.anchor` and throws inside a click handler.

Proposal Risk: 2/10 - A single tuple makes the pair indivisible, but hunk indices still travel through rendered row data, so a stale row must still be rejected by an explicit bound check.

Proposal: `web/src/editor/useEditorSuggest.ts` defines `PendingSuggest` with `hunks: SuggestHunk[]` and a parallel `resolved: boolean[]`; `resolveHunk`, `acceptHunk` and `declineHunk` index both arrays, and `web/src/editor/editor-rows.ts` `buildEditorRows` takes them as two arguments and re-pairs by index. Change `PendingSuggest` to hold `hunks: { hunk: SuggestHunk; resolved: boolean }[]`, update the three handlers to operate on one entry with an explicit `index >= 0 && index < hunks.length` guard, and change `buildEditorRows` to take the single array so every `hunkIndex` it emits is in range. `web/src/editor/EditorLines.tsx` passes `row.hunkIndex` back into the handlers and needs no signature change. `web/src/editor/useEditorSuggest.test.ts` and `web/src/editor/editor-rows.test.ts` cover accept and decline with valid indices; add a stale-index case asserting the handler is a no-op rather than throwing.


## deferred

## declined
