# pull-request

## ready

## development

* Cover the resolution that picks the Chromium application bundle the browser profile carves in.

Existing Issue: `src/browser/playwright-paths.ts` arrives with no colocated test file, and `chromiumBundleDir`'s walk up to the nearest `.app` ancestor and its three separate fallbacks are exercised nowhere — the browser server's suite replaces the whole module with a stub and the sandbox suite supplies the bundle directory as a fixture instead. Severity: 4/10

Existing Risk: 4/10 - What this function returns is the single path the browser profile grants Chromium read access to, so a wrong answer either stops the browser starting on a host nobody can reproduce or widens a Seatbelt carve-in beyond the bundle, and no test in the suite would move either way.

Proposal Risk: 2/10 - The resolution is pinned against constructed layouts rather than against whatever Playwright happens to have installed, so a real installation whose shape nobody anticipated can still resolve wrongly — which is why the test should assert on a supplied executable path rather than only on the ambient one.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 975: cover the Chromium bundle resolution the browser Seatbelt profile depends on". Add `src/browser/playwright-paths.test.ts`. `findChromiumBundleDir` in `src/browser/playwright-paths.ts` resolves `playwright`, calls `chromium.executablePath()`, realpaths it when it exists, then walks ancestors until one has a `.app` extension, falling back to the executable's own directory; it returns the shared placeholder constant when the package will not resolve or the path is empty. To test the walk without depending on an installed browser, extract the ancestor search into an exported pure helper taking an executable path and returning the directory, leave `chromiumBundleDir` as the memoized wrapper over it, and cover: a macOS-shaped path ending `…/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing` resolving to the bundle and not to `Contents` or `MacOS`; a bare non-bundled executable resolving to its own directory rather than walking to the filesystem root; a path with a `.app` ancestor above another `.app` resolving to the nearest one; and the memoization returning the same value without re-resolving. Cover `packageDirOf`'s manifest walk in the same file, including its fall back to the entry's own directory when no `package.json` is found, and `playwrightPackagePaths` returning the placeholder for a specifier that will not resolve — the branch that keeps a Seatbelt `-D` parameter bound to something rather than to nothing. Leave `src/browser/e2e-server.test.ts`'s stub of this module in place; the point is to test the module directly, not to unstub it. `src/sandbox/index.test.ts` already asserts the two Playwright package directories bind to real paths for every sandboxed spawn and must keep passing untouched.


* Refresh the New harness dialog screenshot in the user documentation, which predates the E2E browser checkbox this change adds.

Existing Issue: `documentation/user-documentation/advanced-agents/harness.md` now says the dialog carries an E2E browser toggle that stays available for every harness, while the screenshot directly below that sentence, and the alt text enumerating its fields, still show the previous form without it. Severity: 2/10

Existing Risk: 2/10 - A user comparing the page against their own dialog finds a control the page's only illustration does not have, which reads as documentation written for an older release and puts the rest of the page's accuracy in question.

Proposal Risk: 1/10 - The image matches the dialog at the moment it is taken and will drift again the next time a field is added; what would make that visible is the alt text, which should keep enumerating the fields so a later mismatch is readable in the source rather than only in the image.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 975: refresh the New harness dialog screenshot for the E2E browser checkbox". The page's screenshot is referenced as `/screenshots/harness-launch-dialog.png` with alt text listing "harness, label, workspace, offline, auto-approve, model, and effort" — the field set before this change. Retake it with the dialog open, the E2E browser checkbox visible between Offline and Auto-approve, matching the ordering `HarnessLaunchDialog` in `web/src/harness/HarnessLaunchDialog.tsx` renders and the ordering the prose and `product/specs/harness.md` both describe, and update the alt text to include the new toggle, which `ai/guidelines/user-documentation.md` requires to convey the same information the image does. Check whether the same screenshot is referenced from any other page under `documentation/user-documentation/` before replacing it. Nothing under `src/` or `web/src/` changes and no test covers the image, so the check is that the page renders with `npm run docs:dev` and that the new image shows the five controls in the order the surrounding text names.

## deferred

## declined
