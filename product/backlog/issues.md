# issues

## ready

* The `tabs-groups` and `profile-group` screenshots photograph a profile launch that opened nothing, because the fixture profile is in a layout profile lookup no longer reads. Both entries in `scripts/docs-screenshots/manifest.mjs` run `profile launch demo`. `src/profiles.ts` resolves a name to `profiles/<name>.json`, first in the project directory and then in the Janissary installation; the capture fixtures carry `scripts/docs-screenshots/fixtures/profiles/demo/` — a *directory* holding `editor.json` and `writer.json`, the pre-single-file layout — and the repo's own `profiles/` has no `demo.json`, so neither lookup resolves and the launch reports the profile missing. The committed `profile-group.png` is a lone `janus` tab; `tabs-groups.png` shows only what its own `agent bilal` opened, with no group band at all, which is the one thing both doc pages are there to show. Observed on `master` at 477299b5. The fix is a `profiles/demo.json` in the fixtures declaring the agents and groups those two pages describe, which is `ai/tasks/update-documentation.md`'s work.

## development

## deferred

* The documentation screenshot pipeline still kills the tab's e2e browser after the first shot, and the cause is not the supervisor #989 reverted. Observed on `master` at 95a52eb6, with #987 already reverted and #990's guard fix in place: a `./scripts/run.mjs docs-screenshots` run in a `-b` workspace connected, captured `app-overview` normally, and the browser child exited in the same second the PNG was written. Nothing ever asked it to close — the run reached no second shot, so no `browser.close()`, no `file:` URL, and no unparseable frame was sent. This is the empirical repro #990 asked for before any second attempt at replacing a dead browser, and it moves the fault off the supervisor: #987 was reacting to a browser that was already dying, and #989 removed the mitigation without removing the fault. The failure signature #989 documented (`OK app-overview` then every later shot failing on `Target page, context or browser has been closed`) is what a client holding one connection sees when the browser dies right after shot one, with or without a relaunch behind it.

## declined
