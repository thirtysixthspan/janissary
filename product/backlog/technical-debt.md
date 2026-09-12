# technical-debt

## ready

* Stop four plugin headers from marking the file size with the image plugin's class in `web/src/plugins/{image,video,audio,markdown}/*Tab.tsx`: each renders `<span className="image-size">`, so the video, audio, and markdown tabs reach into another plugin's vocabulary for a name that belongs to none of them. The class carries no rules anywhere in `web/src` — it is a name with no styling behind it — so nothing renders differently today, and the cost is entirely that a reader looking for where a markdown tab's size is styled is sent to the image plugin. The PDF plugin already moved to `plugin-size`, matching the `plugin-name` and `plugin-loc` the same shared header uses (see `web/src/plugins/shared.css`), which leaves the four behind inconsistent with it. Rename them to `plugin-size` as well, and either give the class a rule in `shared.css` or drop it from all five if the size needs no styling of its own. Severity: **low**.

## development

## deferred

## declined

* Protect user edits made after a copy-paste before undo deletes its destination in `src/file-navigator/moves.ts`: `undoCopyPaste` records only absolute source and destination paths and unconditionally removes each destination, so editing or replacing a copied file before pressing undo silently deletes the newer content. Record enough identity or content metadata with each copy history entry to detect divergence and surface a conflict instead of removing a changed destination. Severity: **high**. — deferred: complexity 8/10, requires recursive destination identity tracking plus new undo conflict semantics across server history and client conflict handling.

* Stop the sandbox-confinement tests from passing vacuously off darwin in `src/sandbox/index.test.ts`: seventeen cases open with a bare `if (!sandboxAvailable()) return;`, and `sandboxAvailable()` requires `process.platform === 'darwin'` plus `/usr/bin/sandbox-exec`, so on the `ubuntu-latest` runners every job in `.github/workflows/ci.yml` uses, all of them return before their first assertion and are reported as *passing* rather than skipped. Every assertion about the Seatbelt profile the security model rests on — the `-D` param bindings, the secret-deny paths, the credential scrub, the `TMPDIR` override, the offline variant — therefore only ever runs on a developer's Mac, and CI would stay green if the confined path were deleted outright. Convert them to `describe.skipIf(!sandboxAvailable())` (or `it.skipIf`) so a run that cannot exercise confinement reports skips instead of green passes. Severity: **high**. declined: this application is currently limited to running on mac os x.
