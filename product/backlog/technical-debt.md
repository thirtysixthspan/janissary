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


* Replace the client prop on the shared dock-cycle header with a callback so the header renders markup instead of sending a protocol call.

Existing Debt: The shared dock-cycle header takes a `JanusClient` and sends the `setDock` intent from its button's click handler, violating §5 (components render; they do not decide) by putting a protocol call inside a presentational component's JSX. Severity: 5/10

Existing Risk: 4/10 - A header that can reach the whole client is untestable without a transport fake, and every new docked surface that needs a header copies the service prop instead of supplying its own intent.

Proposal Risk: 2/10 - The two callers still have to send `setDock` with the right tab index, but that call becomes visible in a container where a wrong index is reviewable rather than buried in shared markup.

Proposal: `web/src/shared/DockCycleHeader.tsx` accepts `client` and `index` and calls `client.send({ method: 'setDock', params: { index, dock: nextDock(dock) } })` in the button's `onClick`. Replace those two props with `onCycle(next: 'left' | 'right'): void` and keep `dock`, `classPrefix`, `children` and the `nextDock`/`dockTooltip` helpers as they are. Update the two callers, `web/src/notifications/NotificationsTab.tsx` and `web/src/plugins/DockedPluginBody.tsx`, to pass `onCycle={(next) => client.send({ method: 'setDock', params: { index, dock: next } })}`; both already hold `client` and `index`, so their own props do not change. There is no dedicated header test; `web/src/notifications/NotificationsTab.test.tsx` and `web/src/plugins/DockedPluginBody.test.tsx` render the two callers and pin the surrounding behavior, so add a click assertion for the new `onCycle` seam to one of them and keep both passing. The same service-prop pattern also sits in `web/src/shared/questions/QuestionPanel.tsx` and `web/src/toasts/ToastStack.tsx`; leave those for a separate entry so this stays a three-file change.


* Make the editor tab take its plugin host from the session hook instead of constructing a fallback host of its own.

Existing Debt: The editor tab builds `createEditorPluginHost(() => {})` in a `useMemo` whenever no host is injected, violating §7 (services are injected, never constructed by a component) and duplicating `web/src/useEditorPluginHost.ts`, the hook that owns the session host and its disabled-plugin report queue. Severity: 4/10

Existing Risk: 4/10 - The fallback host's no-op callback throws away every disabled-plugin report, so a standalone render can run with a broken plugin and show no sign of it.

Proposal Risk: 2/10 - Requiring the host at every mount means a caller can still pass the wrong host or an empty reports queue, but that is now an explicit prop at the call site instead of an invisible default inside the component.

Proposal: `web/src/editor/EditorTab.tsx` imports `createEditorPluginHost` and creates `ownHost` in a `useMemo`, using it when the optional `pluginHost` prop is absent and passing it to `useEditorPlugins`; `web/src/useEditorPluginHost.ts` is the hook that creates the one session host and its `reports` array, and `web/src/MountedViewLayers.tsx` already injects both. Make `pluginHost` and `pluginReports` required props, delete `ownHost`, the `createEditorPluginHost` import and the `?? ownHost` fallback from the component, and pass `pluginHost` straight to `useEditorPlugins`. Update the renders that relied on the fallback to supply a host: `web/src/editor/EditorTab.test.tsx`, `web/src/editor/EditorTab.window-keys.test.tsx` and `web/src/useSectionNav.editor.test.tsx` can build one with `createEditorPluginHost` in each fixture. Blast radius is one production call site plus those three test files; the imperative `DirtyTabHandle` and all other props stay unchanged.


* Move the file-safety policy, refusal vocabulary, and remote-tab helpers out of the read and navigator features into one shared file-operations module.

Existing Debt: Workspace containment, secret-path, protected-path, and size policy live in `src/file-read/policy.ts`, the shared result type and reason vocabulary live in `src/file-navigator/file-operation-result.ts`, and the remote-tab bridge and its typed-output helpers live in `src/file-read/remote-tab-port.ts` and `src/file-read/tab-read.ts`, so write, patch, glob, grep, web-search, ACP, and controller modules all import across a feature boundary for rules none of those features owns. Severity: 6/10

Existing Risk: 6/10 - A new file command that copies one containment check but omits the real-path, secret, or protected-path check ships a traversal or secret read, and a change made under the read feature silently alters write, patch, glob, and grep behavior without those owners seeing it.

Proposal Risk: 2/10 - The work is a mechanical move plus import rewrites, with policy and refusal behavior pinned by existing unit and contract tests; the residual risk is a missed import site, which the typechecker catches.

Proposal: Create `src/file-operations/` and move the four shared substrates into it: `src/file-read/policy.ts`, `src/file-navigator/file-operation-result.ts`, `src/file-read/remote-tab-port.ts`, and the `localReadRoot`, `asTyped`, and `rejectionLine` helpers from `src/file-read/tab-read.ts` (into a new `tab-command.ts`, leaving `readFileInTab` alone in `tab-read.ts`). Update every relative import: the 24 `policy.js` sites across `src/file-grep`, `src/file-glob`, `src/file-write`, `src/file-patch`, and `src/file-navigator`, including their tests; the 26 `file-operation-result.js` sites across `src/file-write`, `src/file-patch`, `src/file-read`, `src/file-grep`, `src/tab`, `src/remote`, and `src/commands`, including their tests; the `remote-tab-port.js` sites in `src/file-glob/tab-glob.ts`, `src/file-grep/tab-grep.ts`, `src/web/search/tab-search.ts`, `src/web/fetch/tab-fetch.ts`, `src/file-write/tab-write.ts`, and `src/file-write/outcome.ts`; and the `tab-read.js` helper sites in `src/file-grep/tab-grep.ts`, `src/file-glob/tab-glob.ts`, `src/file-write/tab-write.ts`, `src/web/search/tab-search.ts`, `src/web/fetch/tab-fetch.ts`, and `src/controller/completion.ts`. Move the colocated tests (`policy.test.ts`, `file-operation-result.test.ts`, `remote-tab-port.test.ts`, `tab-read.test.ts`) with their modules and keep exports, error strings, and refusal sentences byte-for-byte so `src/remote/serve-file-navigator.test.ts`, `src/remote/file-navigator-refusal-contract.test.ts`, and the file-grep, file-glob, file-write, and file-patch suites keep passing unchanged. Relative server imports keep the `.js` suffix; the moved modules are leaves, so the move creates no cycle. If the diff is too large for one pass, land `policy.ts` and `file-operation-result.ts` first, since they carry the security checks, and the tab helpers second.


* Define each file and web command's flags once, and generate its parser, completion candidates, and usage text from that definition.

Existing Debt: The flag grammar for `file read`, `file glob`, `file grep`, and `web search` is written out three times — a hand-rolled scanner in each command module, a second flag list and argument state machine in `src/completion/file-read.ts`, `src/completion/file-grep.ts`, and `src/completion/web.ts`, and a third copy in each usage constant and primer — with four different scanner idioms and different flag/positional ordering rules. Severity: 6/10

Existing Risk: 4/10 - A flag added to a parser but not to the completion lists is silently uncompletable, and the ordering rules already differ enough that a caller cannot rely on one command behaving like another: `file glob` accepts flags after the pattern, `file grep` requires them before and supports `--`, and `web search` requires the query first.

Proposal Risk: 2/10 - Parser and completion are driven from the same spec, so drift becomes a type error or a failing completion test; the residual risk is an acceptance change in one command, which its existing parser suite should catch.

Proposal: Add `src/command-line/spec.ts` with a `CommandSpec` that names the command path, positional shape (including "rest of the line"), and each flag's kind (switch or value), value validator, completion source, and usage fragment, plus `parseArgs(spec, tokens)` returning either values or a usage failure. Express the current rules as spec options rather than changing them: `file grep` keeps flags-before-pattern, `--`, and duplicate-flag rejection; `file glob` keeps its any-order flags and no terminator; `file read` keeps its trailing flags; `web search` keeps the query first and its flag section second. Replace `scanArguments` in `src/file-read/command.ts`, `src/file-glob/command.ts`, and `src/file-grep/command.ts` with calls to the shared parser, and extend the same to the web commands `src/web/search/command.ts` and `src/web/fetch/command.ts` (`parseWebFetch`, `WEB_FETCH_USAGE`), whose scan loop is already the shared `scanFlagArguments` in `src/web/flag-scan.ts` rather than a local `scanArguments`; keep `parseFileRead`, `parseFileGlob`, `parseFileGrep`, `parseWebSearch`, and `parseWebFetch` signatures and error strings so `src/file-read/command.test.ts`, `src/file-glob/command.test.ts`, `src/file-grep/command.test.ts`, `src/web/search/command.test.ts`, and `src/web/fetch/command.test.ts` are unchanged. Generate `FILE_READ_USAGE`, `FILE_GLOB_USAGE`, `FILE_GREP_USAGE`, `WEB_SEARCH_USAGE`, `WEB_FETCH_USAGE`, and the primer lines from the specs, and have `src/completion/file-read.ts`, `src/completion/file-grep.ts`, and `src/completion/web.ts` read candidates from the specs, deleting `FILE_READ_FLAGS`, `FILE_GLOB_FLAGS`, `FILE_GREP_FLAGS`, `FILE_GREP_SWITCHES`, `FILE_GREP_VALUE_FLAGS`, `grepArgumentState`, `SEARCH_FLAGS`, `FETCH_FLAGS`, `FORMAT_VALUES`, and `DEPTH_VALUES`; their suites (`src/completion/file-read.test.ts`, `file-grep.test.ts`, `web.test.ts`) pin the candidate lists. Leave `file write`, `file edit`, and `file patch` out of this pass because their one-line JSON payload grammar is a different shape.


* Derive the application command inventory's built-in forms from the core command registry so a new command cannot silently miss the settings list.

Existing Debt: `src/application-commands.ts` keeps a hand-written `BUILTIN_FORMS` table keyed by command name that shadows `coreCommands` from `src/commands/index.ts`, and `buildApplicationCommands` silently skips any core command missing from the table, so the registry and its policy inventory are two lists that must be edited together with nothing checking that they were. Severity: 5/10

Existing Risk: 5/10 - A command added to `coreCommands` without a matching row disappears from `listApplicationCommands`, so it never appears in the command settings UI and its agent access cannot be revoked, while `disabledApplicationCommand` simply returns undefined and the command keeps running.

Proposal Risk: 2/10 - A parity test turns the omission into a failing build; the residual risk is a command that legitimately needs no settings row, which has to be named explicitly in the test's exception rather than skipped by a missing key.

Proposal: Move the table next to the registry it mirrors as `src/commands/forms.ts` exporting `COMMAND_FORMS` (the data currently in `BUILTIN_FORMS`), and have `src/application-commands.ts` import it and keep `builtinRows` unchanged. Add `src/application-commands.parity.test.ts` asserting four things: every `coreCommands` entry except `shell` (owned by the shell plugin and asserted absent in `src/application-commands.test.ts`) has a declaration; every declaration key names a live core command, so no stale rows; every declared form resolves through `resolveApplicationCommand` to a row whose `forms` contains that form; and every declared parent names a real command row. Do the test first and let it pass against the current table, then move the data in a second commit; `src/native-commands/settings-file.ts`, `policy.ts`, and `state.ts` keep consuming `listApplicationCommands` and need no change. The existing `src/commands.test.ts` shadow checks on `samples` stay as they are — samples describe dispatch, forms describe policy, and this entry does not merge them.


* Source the app's server-owned display limits from one settings object and remove the component fallback literals that shadow them.

Existing Debt: The tab-name limits and clipboard-history cap arrive in the state snapshot, but the client seeds them with its own `16`, `50`, and `15` in `web/src/useServerState.ts`, repeats `= 16` and `= 50` as optional prop defaults in `web/src/AppShell.tsx`, `web/src/Sidebar.tsx`, `web/src/TabStrip.tsx`, and `web/src/TabItem.tsx`, and hardcodes `tabNameMaxLength={50}` in `web/src/ReportingSection.tsx`, so the same server setting is declared in five places with no single source. Severity: 5/10

Existing Risk: 5/10 - A server config change or a missed prop falls back to a stale literal instead of failing, and reporting rows already truncate tab names at 50 while the configured inactive limit is 16, so the same tab can read differently in two surfaces with no test noticing.

Proposal Risk: 2/10 - Settings come from one provider seeded by the snapshot, so a forgotten consumer is a type error instead of a stale default; the residual risk is a leaf that still receives a literal from its caller, which a ReportingSection assertion now covers.

Proposal: Add `src/shared/config-defaults.ts` with `DEFAULT_TAB_NAME_MAX_LENGTH`, `DEFAULT_ACTIVE_TAB_NAME_MAX_LENGTH`, and `DEFAULT_CLIPBOARD_HISTORY_MAX_ENTRIES`, import them from `src/config.ts`, and seed `web/src/useServerState.ts` from the same module through `@shared/shared/config-defaults` (a runtime-value import, so confirm the path resolves in `web/tsconfig.json`, `web/vite.config.ts`, and the client project in `vitest.config.ts`, as `ai/guidelines/architecture-principles.md` requires). Replace `useTabNameLimits` and `useClipboardHistoryCap` with one `useAppSettings()` returning `{ settings, setSettings }` for the three values, and change `useServerState`'s `Setters` to take one `setSettings` that merges a partial settings object instead of the three individual setters it takes today (`setTabNameMaxLength`, `setActiveTabNameMaxLength`, `setClipboardHistoryMaxEntries`). Provide the object through an `AppSettingsProvider` beside `PluginChordProvider` in `web/src/App.tsx`, and have `web/src/Sidebar.tsx`, `web/src/ReportingSection.tsx`, and `web/src/AppCenterActionArea.tsx` read it and pass required values to `web/src/TabStrip.tsx` and `web/src/TabItem.tsx`; delete `AppMain.tsx`'s two length props, the two fields in `web/src/CenterActionAreaProps.ts`, and every `= 16`, `= 50`, and `tabNameMaxLength={50}` literal. Keep leaf components taking the narrow numbers they render rather than the whole settings object, per `ai/guidelines/react-code-organization.md`. Update `web/src/useServerState.test.ts`, `web/src/App.test.tsx`, `web/src/Sidebar.test.tsx`, `web/src/TabStrip.test.tsx`, and `web/src/ReportingSection.test.tsx`, and add a ReportingSection case that fails when reporting rows truncate at anything other than the configured inactive length. The server stays authoritative; this pass only deletes the client's copies.


* Replace the inert import-cycle lint rule with a tested import-graph check that fails on real runtime cycles.

Existing Debt: `eslint.config.mjs` sets `'import-x/no-cycle': 'error'` while its own note says the rule's graph traversal does not fire in this setup and recommends a manual `npx madge --circular --extensions ts,tsx src` instead, and no script, test, or CI step runs that command, so the configured guard is documentation rather than enforcement. Severity: 5/10

Existing Risk: 5/10 - An import cycle can land with every check green and surface only as an undefined binding at module evaluation, a plugin activation that never runs, or a client entry chunk that pulls host code in, all of which look like unrelated bugs at the call site.

Proposal Risk: 2/10 - The graph check fails on real runtime cycles; the residual risk is a cycle formed through syntax the scanner does not parse, which the check should report as unanalysed rather than silently skip.

Proposal: Add `scripts/import-cycles.mjs`, run through `$janissary/scripts/run.mjs` and wired into the `check` script in `package.json` and the `check-diff` orchestrator in `scripts/check-diff.mjs` when `src/` or `web/src/` changed, that walks `src/**/*.ts` and `web/src/**/*.{ts,tsx}`, parses static `import`/`export ... from` specifiers, records whether each statement is type-only, resolves relative `.js`/extensionless specifiers to files, and reports every cycle containing at least one runtime edge. Add `scripts/import-cycles.test.mjs` with synthetic trees covering a two-file runtime cycle (fails), an all-`import type` cycle (passes, because TypeScript erases it), a cycle through `export ... from` (fails), and a self-import (fails), following the fixture style in `scripts/help-doc-changes.test.mjs`. Run the check against the current tree before enabling the gate; if it finds a pre-existing runtime cycle, fix it in the same change rather than adding a silent allowlist. The completed `product/plans/complete/split-types-by-domain.md` records that a manual madge run reported many type-only edges, which is why the runtime-only rule matters. Remove the `import-x/no-cycle` entry and its note from `eslint.config.mjs`; `src/eslint-plugin-boundaries.test.ts` and `src/eslint-feature-boundaries.test.ts` stay as they are because they test rules that do fire.


* Use the shared path-containment rule for static assets instead of a string prefix so a sibling directory can never be served.

Existing Debt: The static server clamps requested paths with a string `startsWith` check while the project's containment rule is shared across the other file-serving paths, so the asset boundary is defined twice. Severity: 7/10

Existing Risk: 8/10 - A directory whose name shares the bundle directory's prefix lets a crafted URL select a path outside the bundle, because the check compares characters rather than path components.

Proposal Risk: 2/10 - The clamp becomes component-aware and falls back to the SPA shell, but the separate allow-list behind `/open/` remains a second guard that must stay intact.

Proposal: `src/serve-static.ts` `staticFileServer` normalizes the URL path and checks `if (!file.startsWith(options.webDir))`, falling back to `index.html`. `src/path-containment.ts` exports `containedAbsolute`/`containedPath`, and its header comment already names the serve process as a consumer, but this module imports none of it. Replace the prefix test with `containedAbsolute` on the resolved bundle directory, computing the absolute directory once when the server is built, and keep the SPA fallback for rejected paths. There is no `serve-static.test.ts`; `src/index.test.ts` covers origin rejection, SPA fallback, `/open/` token handling and malformed URLs but no traversal or prefix-sibling case. Add cases where the bundle directory has a sibling sharing its prefix and where the URL contains `../` segments, asserting the shell is served and no file outside the bundle directory is read.


* Refuse to create or overwrite a conversation written by a newer schema version instead of treating it as absent.

Existing Debt: The conversation store treats an exact schema-version match as the only valid document, so a record from a newer build is indistinguishable from a malformed one and can be replaced by a fresh conversation under the same id. Severity: 6/10

Existing Risk: 8/10 - After switching to an older build, a newer conversation is read as absent, a new one is created under the same id, and the next save overwrites the file, losing its turns with no warning.

Proposal Risk: 2/10 - A newer-version file is preserved and reported, but there is still no migration path, so those conversations stay unavailable until a build that understands their version runs.

Proposal: `src/conversations/store.ts` `isConversation` requires `value.schemaVersion === CONVERSATION_SCHEMA_VERSION`, and `read`/`scan` classify a mismatch as malformed. `src/conversations/manager.ts` `create` starts with `if (this.conversations.has(id) || this.store.read(id)) return false;`, so a version-mismatched file passes as absent and a replacement conversation is created and later written over it. Follow the pattern already in `src/schedule/system/store-decode.ts`, which returns `kind: 'unsupported-version'` for a future version: add a distinct decode outcome for a recognized-but-newer version, have `scan` report it without the malformed-file warning, and make `create` and the write paths refuse to overwrite such a record. `src/conversations/store.test.ts` exercises only version-1 and broken JSON documents; add a test writing a v2 document and asserting it is preserved and that `create` does not replace it.


* Make the ACP session handshake an explicit state so an early error cannot permanently suppress the connection.

Existing Debt: The connection handshake is tracked by three independent flags whose ordering is the protocol, and the error flag is never cleared, so an error recorded before connecting silently blocks the publish that follows a successful connect. Severity: 6/10

Existing Risk: 6/10 - An early transient error followed by a successful connect leaves the session with no core record and no connect hook, so the tab shows no agent even though the process is running; post-connect errors can also fire repeatedly.

Proposal Risk: 2/10 - An explicit state makes each transition total, but the hooks still have side effects, so a transition that fires twice would still be visible.

Proposal: `src/acp/session-manager.ts` `AcpSessionManager.session()` declares `connecting`, `connected` and a write-once `failure`; `publish()` returns early when `failure !== undefined`, `onError` records it without clearing it, and the post-connect branch calls `hooks.onError(failure)` whenever one was recorded, even when `connected` is true. Replace the three flags with one state such as `'connecting' | 'connected' | 'failed'`, move the "record now versus call the hook now" decision into a single `onError` transition, and let `publish` refuse only in the failed state after the connection has settled. `AcpManager.acquire` in `src/acp/manager.ts` is the hook consumer that settles the prompt and closes the tab, so keep exactly one error delivery. There is no `session-manager.test.ts`; indirect coverage lives in `src/acp/record-feed.test.ts` and `src/acp/manager.test.ts`; add a colocated test for early-error-then-connect and for two post-connect errors asserting one publish and one settle.


* Emit the ACP tool loop's terminal event when a native command throws so the prompt settles and state refreshes.

Existing Debt: The tool loop's error path ends the run without its finished event, so the cleanup that only the terminal handler performs is skipped. Severity: 6/10

Existing Risk: 6/10 - A command that rejects leaves the prompt unsettled with no state-change notification and no dirty broadcast, so the transcript keeps looking busy and the connection row never updates.

Proposal Risk: 2/10 - Both paths end with a terminal event, but the handler still distinguishes outcomes by the event reason, so a wrong reason changes row state.

Proposal: `src/acp/loop.ts` `runAcpToolLoop` catches a throwing or rejecting `dependencies.runCommand`, calls `h.error(errorText(error))` and returns, while the normal end emits `h.finished(command ? 'capped' : 'answered', maxSteps)`. The `finished` handler in `src/acp/run-prompt.ts` performs the state-change notification, rate-limit check, dirty broadcast and `answered: true` settle that the error handler does not. Emit a terminal event on the catch path too, with a reason that conveys failure, and have the `run-prompt.ts` handler map that reason to the same cleanup while preserving the error line. `src/acp/loop.test.ts` covers `session.onError` but not a throwing command, and `src/acp/drive-loop.test.ts` asserts only the error line for a rejecting host; add an assertion there that a terminal event follows and the prompt settles.


* Report a failed cleanup of the OAuth staging file instead of leaving a second plaintext credential on disk.

Existing Debt: The OAuth seeding step silently ignores a failure to remove its temporary file, so a successful result can leave a duplicate copy of the credential behind. Severity: 6/10

Existing Risk: 7/10 - A stale `.auth-seed` holding the full OAuth token remains in the sandbox data home, outliving the linked auth file and invisible to the caller that reported the preparation available.

Proposal Risk: 2/10 - The failure surfaces as a preparation failure, but the link has already been made by then, so cleanup must also remove that link to leave no copy at all.

Proposal: `src/sandbox/opencode-data.ts` `writeOauth` creates `<dataHome>/opencode/.auth-seed` with mode 0o600, hard-links it to `auth.json`, then runs `try { unlinkSync(staging); } catch { return; }`, swallowing the error and returning success. Remove the silent catch so the failure propagates to `prepareOpencodeData`, which already maps storage errors to `{ type: 'failed', reason: 'storage' }`, and remove the linked file when the staging removal fails so no duplicate remains. `src/sandbox/opencode-data-failures.test.ts` forces a partial write failure and checks the staging file is gone, and `src/sandbox/opencode-data.test.ts` checks the seeded auth file and its mode but not staging after a successful link; add a case that makes `unlinkSync` throw and asserts a storage-failure result with no lingering credential file.


* Re-check the lock file at deletion time so shutdown cannot remove a lock another instance just took over.

Existing Debt: Lock release reads the pid and then deletes unconditionally, while acquisition treats a changed lock as a reason to refuse, so the two sides apply different rules to the same race. Severity: 6/10

Existing Risk: 6/10 - If the lock is judged stale and replaced between the read and the delete, shutdown removes the new owner's lock and a third process is admitted into the same directory.

Proposal Risk: 2/10 - The delete becomes conditional on the content, but the read and delete remain separate syscalls, so a narrow race survives unless an atomic compare-and-delete is available.

Proposal: `src/instance-lock.ts` `releaseLock` calls `readLockPid(projectDir)` and then `rmSync(lockPath(projectDir), { force: true })`. `acquireLock` in the same file uses `clearIfStale(file, content)` from `src/pid-lock-file.ts`, which deletes only when the file still holds the content it judged stale. Reuse that guarded removal in `releaseLock`: read the exact file content, re-read immediately before removal, and delete only if unchanged and still naming this process. `src/instance-lock.test.ts` covers only sequential release cases for matching, foreign and invalid pids; add a case where the lock content changes between the first read and the removal and assert the new content survives.


* Recognize native ACP commands from one vocabulary so gating and extraction cannot disagree about what a command is.

Existing Debt: The same native-command vocabulary is recognized by two independent mechanisms whose rules are kept in sync by hand. Severity: 5/10

Existing Risk: 5/10 - Adding or rewording a native command in one place narrows gating or extraction on the same path, so a command the model is told it may run is refused or never extracted from its reply.

Proposal Risk: 2/10 - One recognizer feeds both paths, but the per-tool line matchers still have their own predicates, so a reply-line form one of them misses remains invisible.

Proposal: `src/acp/native-commands.ts` `nativeCommandName` recognizes commands by splitting `NATIVE_ACP_COMMANDS` and matching token prefixes, while `src/acp/tool-table.ts` `createAcpToolTable` gives each tool its own `match` predicate: regexes for browser, question and file, `isWebCommandLine` for web, and a `match: () => true` database fall-through. `gateCoreCommand` and `toolExtractor` in `tool-table.ts` call both recognizers on the same command. Export one predicate over `NATIVE_ACP_COMMANDS` that both the tool-table entries and `nativeCommandName` consume, keeping the database fall-through explicit. `src/acp/native-commands.test.ts` and `src/acp/tool-table.test.ts` test each recognizer alone; add a parity test walking every `NATIVE_ACP_COMMANDS` entry through both and asserting identical recognition.


* Share one recurrence validator between the schedule parser and the stored-entry decoder so persisted entries keep the parser's rules.

Existing Debt: The grammar of a valid schedule entry is spelled out twice, once while parsing user input and again while decoding persisted entries, with the second copy relying on casts to narrow `unknown`. Severity: 5/10

Existing Risk: 5/10 - A change to accepted time, interval or weekday rules on the parser side leaves stored entries validated by the old rules, so a schedule can be created one way and silently accepted or dropped differently after a reload.

Proposal Risk: 2/10 - One validator is used at both boundaries, but the stored snapshot still has its own version gate and command-string check, so those can drift independently.

Proposal: `src/schedule/parsing.ts` `parseTimeOfDay` and `parseInterval`, together with `src/schedule/every-schedule.ts` `parseEverySchedule`, define the accepted clock, interval and weekday shapes; `src/schedule/system/store-decode.ts` `validClock`, `validEntry` and `hasNoRecurrenceFields` re-derive the same rules with casts such as `(time.hour as number)` and re-check `value.command !== \`script ${value.script}\``. Extract a shared guard module, for example `src/schedule/validity.ts`, exporting the clock, interval and recurrence validators, and call it from both the parser and the store decoder, leaving the version gate in `store-decode.ts`. `src/schedule/system/store-decode.test.ts` checks hand-picked invalid cases and `src/schedule/index.test.ts` covers the parser; add a round-trip test feeding parsed entries through the decoder plus a case where a stored entry violates a parser rule.


* Reject non-positive or non-integer terminal dimensions in asciicast headers before they reach the terminal emulator.

Existing Debt: The header parser validates only the JavaScript type of the terminal dimensions while its sibling resize parser validates their numeric shape, so the same value is trusted at one boundary and checked at the other. Severity: 5/10

Existing Risk: 5/10 - A recording whose header carries `Infinity`, a negative number or a fraction creates a terminal with a nonsensical size, so the tab renders blank, allocates an oversized grid, or throws during first render.

Proposal Risk: 2/10 - Dimensions are now safe integers, but very large finite values are still accepted, so a hostile recording can still request an expensive grid.

Proposal: `web/src/plugins/asciicast/cast-stream.ts` `parseCastHeader` checks only `typeof cols !== 'number' || typeof rows !== 'number'` and returns the header with those values; `createAppTerminal` in `web/src/plugins/asciicast/useAsciicastTerminal.ts` receives them directly. The same file's `parseResize` already requires `/^\d+$/u` on both parts. Require `Number.isSafeInteger` and a positive value for both dimensions in the header guard, reusing a shared positive-dimension predicate if the resize parser can use it too. `web/src/plugins/asciicast/cast-stream.test.ts` covers only the missing-size case; add cases for `Infinity`, a negative value and a fraction asserting the header is refused, and keep the resize parser cases passing.


* Trim resolved row-key buckets when a page begins, not only when a key is minted, so empty pages cannot grow the store without bound.

Existing Debt: The store's page buckets are created by one method and evicted by another, so the documented bound applies only when a page actually mints a key. Severity: 5/10

Existing Risk: 4/10 - Repeated queries that return no rows or keyless results push an empty bucket per page for the life of the browser, so a long session paging through empty results grows memory without eviction.

Proposal Risk: 2/10 - Empty buckets are evicted, but a page that mints keys and is then superseded still relies on eviction during a later mint, so a long idle gap can retain extra keys.

Proposal: `src/database/row-keys.ts` `RowKeyStore.beginPage` pushes a new bucket while only `mint` calls `trim`, and the comment above `RESOLVED_PAGES` claims the bound keeps the map from growing with use. Call `trim()` at the end of `beginPage` as well, so the bucket array stays bounded whether or not a page yields keys. `src/database/grid.ts` `runGrid` calls `beginPage` for every page including empty ones and should keep doing so. `src/database/write.test.ts` tests eviction only for pages that minted keys; add a case that begins more than `RESOLVED_PAGES` empty pages and asserts that buckets from the earlier pages were discarded before any later mint.


* Reduce the cognitive complexity of `decodeModelCatalog()` in `src/models/catalog-file.ts` (line 21), reported at 27 against the allowed 15 in a file scoring 46.81 FTA across 78 lines. The function validates a nested harness-to-records object for a model catalog, with each record's field checks an inline chain of early-return type guards inside two nested loops, so every added field deepens the same chain. Extract the per-record validation into a local helper and leave the outer harness loop in place; the exported signature does not change. Resolve by running the `ai/tasks/hygiene/reduce-complexity.md` task against `decodeModelCatalog()` in `src/models/catalog-file.ts`. Severity: **medium**.


* Reduce the cognitive complexity of `orderedKeys()` in `src/native-commands/decode.ts` (line 9), reported at 23 against the allowed 15 in a file scoring 44.97 FTA across 67 lines. The function scans settings JSON text by hand to collect top-level keys, and the complexity comes from a character switch whose quoted-string case nests a second escape-aware loop over the same shared depth and expecting-key state. Lift the string-skipping loop into a local helper so the switch keeps only the delimiter cases. Resolve by running the `ai/tasks/hygiene/reduce-complexity.md` task against `orderedKeys()` in `src/native-commands/decode.ts`. Severity: **medium**.


* Reduce the cognitive complexity of `intent()` in `src/plugins/connections/activate.ts` (line 52), reported at 17 against the allowed 15 in a file scoring 48.50 FTA across 90 lines. The function dispatches a connections tab request by testing each intent name in turn and validating its payload branch by branch before delegating, so every new intent adds another guarded arm to the chain. Flatten the chain into a local per-intent lookup or lift the payload validation into a helper; the function is private to the activation module. Resolve by running the `ai/tasks/hygiene/reduce-complexity.md` task against `intent()` in `src/plugins/connections/activate.ts`. Severity: **low**.


## deferred

## declined
