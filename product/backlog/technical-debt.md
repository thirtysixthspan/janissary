# technical-debt

## ready

* Correct the architecture guideline's command-routing section, which still describes a schedule branch running ahead of the command registry that no longer exists.

Existing Debt: The binding architecture guideline names a live violation of its own one-command-one-definition rule that has since been fixed, so the document every agent is instructed to read before working describes a code path the codebase does not have. Severity: 3/10

Existing Risk: 4/10 - An agent that trusts the paragraph either hunts for a branch it cannot find or re-adds one ahead of the registry to match the description, which is exactly the shadow execution path the rule beneath it exists to forbid.

Proposal Risk: 2/10 - The paragraph would describe the code as it stands, but nothing ties the two together, so the next branch added ahead of the registry leaves it wrong again in the same way.

Proposal: Section 5 of `ai/guidelines/architecture-principles.md` opens its second paragraph with "One branch still runs ahead of the registry: `CommandManager.run` opens the schedule dialog for a bare `schedule` before calling `resolveCommand`." `CommandManager.run` in `src/command/manager.ts` now calls `resolveCommand` first and switches on the resolution, with no schedule branch anywhere before it, and `schedule` is an ordinary registry entry — imported from `src/commands/schedule.ts` and listed in `coreCommands` in `src/commands/index.ts`. Rewrite that first sentence to name what actually bypasses `executeCommand` today: the `shell` resolution, which `run` routes to its own `runShell` rather than through the registry. Keep the paragraph's remaining two sentences, which are still accurate — `harness` and `ssh` are `Command` entries, and `ROUTE_NAMES` in `src/plugins/command-adapter.ts` is `['shell']`, already as short as the branches it shadows — and do not touch the rule statement in the third paragraph. Nothing in the test suite reads this document, so the verification is reading `src/command/manager.ts`, `src/commands/index.ts`, and `src/plugins/command-adapter.ts` and confirming the rewritten sentence matches all three; `src/commands.test.ts`, which walks the registry for shadowing, is what keeps the registry claim true.


* Compose the file-backed tab payload once in the plugin host's shared file helpers instead of rebuilding it in each viewer plugin's activation.

Existing Debt: The module that exists to hold the operations every file-backed tab plugin performs holds the size helper and the external-open helpers but not the payload construction itself, so four viewer plugins each rebuild the same name/path/size/url record around the same resource-registration call. Severity: 3/10

Existing Risk: 3/10 - A change to what a file tab must carry has to be found and repeated in four activations, and a plugin missed in that sweep opens a tab whose client half renders against a field the server never sent.

Proposal Risk: 2/10 - One helper becomes the only producer of the common fields, but each plugin's payload type, guard, and schema version stay its own, so a plugin adding a field still declares and validates it alone.

Proposal: `src/plugins/files.ts` describes itself as "the operations every file-backed tab plugin performs, composed once from the capability primitives the contract already supplies" and exports `fileSize`, `openFileExternally`, `openFileInConfiguredViewer`, and `servesContentType`. The one operation it does not hold appears verbatim in `activate` in `src/plugins/markdown/activate.ts`, in `openPdfTab` in `src/plugins/pdf/activate.ts`, in `activate` in `src/plugins/video/activate.ts` (with one extra `player` field), and in the local `imagePayload` helper in `src/plugins/image/activate.ts`: `{ name: path.basename(file), path: file, size: fileSize(file), url: resources.registerFile(file) }`. Add `fileTabPayload(file, resources)` to `src/plugins/files.ts` returning those four fields, and have each site spread it — `{ ...fileTabPayload(file, resources), player: capabilities.configuredViewer() }` for video, and `imagePayload` reduced to the spread plus its existing mode-omitted-not-undefined branch. Do not move the payload *types* or their guards: `ai/guidelines/plugins-tabs.md` requires `src/plugins/<id>/shared.ts` to import nothing at all, not even a type, so each plugin keeps declaring and guarding its own shape and its own schema version, and the helper only builds the value the server hands to `openOrFocusTab`. `src/plugins/audio/activate.ts` builds a playlist rather than a single file record and is deliberately outside this. `src/plugins/files.test.ts` covers the existing helpers and is where the new one's test belongs; `src/plugins/markdown/activate.test.ts`, `src/plugins/pdf/activate.test.ts`, `src/plugins/video/activate.test.ts`, and `src/plugins/image/activate.test.ts` pin what each opened tab's payload must still contain and must pass unchanged.

## development

## deferred

## declined

* Protect user edits made after a copy-paste before undo deletes its destination in `src/file-navigator/moves.ts`: `undoCopyPaste` records only absolute source and destination paths and unconditionally removes each destination, so editing or replacing a copied file before pressing undo silently deletes the newer content. Record enough identity or content metadata with each copy history entry to detect divergence and surface a conflict instead of removing a changed destination. Severity: **high**. — deferred: complexity 8/10, requires recursive destination identity tracking plus new undo conflict semantics across server history and client conflict handling.

* Stop the sandbox-confinement tests from passing vacuously off darwin in `src/sandbox/index.test.ts`: seventeen cases open with a bare `if (!sandboxAvailable()) return;`, and `sandboxAvailable()` requires `process.platform === 'darwin'` plus `/usr/bin/sandbox-exec`, so on the `ubuntu-latest` runners every job in `.github/workflows/ci.yml` uses, all of them return before their first assertion and are reported as *passing* rather than skipped. Every assertion about the Seatbelt profile the security model rests on — the `-D` param bindings, the secret-deny paths, the credential scrub, the `TMPDIR` override, the offline variant — therefore only ever runs on a developer's Mac, and CI would stay green if the confined path were deleted outright. Convert them to `describe.skipIf(!sandboxAvailable())` (or `it.skipIf`) so a run that cannot exercise confinement reports skips instead of green passes. Severity: **high**. declined: this application is currently limited to running on mac os x.
