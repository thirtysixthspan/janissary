# Open an image with the `image <path>` command

**Complexity: 2/10** — the image plugin gains a declared command that routes into its existing opener through `openClaimedFiles`, exactly as `pdf`, `video`, and `audio` already do. No new host machinery.

The bundled image plugin (`src/plugins/image/`) claims the image extensions and implements the inline, external, and edit presentations, but it declares no command, so `open` and `edit` are the only routes to an image tab. The PDF, video, and audio plugins each declare a command of their own (`pdf <path>`, `video <path>`, `audio <path>`) whose handler hands the whole argument to `capabilities.openClaimedFiles`, which runs the host's ordinary `open` pipeline pinned to that plugin's opener. That gives the command the same path resolution, wildcard expansion, ten-file limit, missing-file errors, and focus-existing behavior as `open`, and refuses a file of another kind by name.

One wording defect surfaces with the new command: the host's pinned-opener refusal is always `<id>: <target>: not a <id> file`, so `image notes.txt` would read `not a image file`. The audio command already reads `not a audio file`, which contradicts the open spec's own wording ("reported as not an audio file").

## Goal

`image <path>` opens the image in an image tab, the same way `open <path>` does for an image file. It accepts the same paths and wildcards as `open`, focuses an image that is already open, and `image external <path>` hands it to the OS viewer. Bare `image` prints `Usage: image <path>`. A file that is not an image is refused as `image: <path>: not an image file`, and a web address is refused the same way.

## Approach

Copy the PDF plugin's command shape: declare `command: 'image'` and the `openClaimedFiles` capability in the manifest, and add a `command` handler to the activation that rejects an empty argument with the usage line and otherwise calls `openClaimedFiles(argument)`. The plugin's `edit` presentation and intents do not change.

Fix the refusal article in `pinnedOpenerRefusal` (`src/open/file-command.ts`): use `an` when the opener id starts with a vowel, so the image and audio refusals read correctly and match the spec. Video and PDF refusals are unchanged.

## Implementation steps

1. `src/plugins/image/manifest.ts`: add `command: 'image'` and `'openClaimedFiles'` to `capabilities`.
2. `src/plugins/image/activate.ts`: add a `command` handler that returns `capabilities.rejectRequest('Usage: image <path>')` for an empty argument and otherwise calls `capabilities.openClaimedFiles(argument)`.
3. `src/open/file-command.ts`: choose `a` or `an` in `pinnedOpenerRefusal` from the opener id's first letter.
4. `help/image.md`: new command page in the shape of `help/pdf.md`.
5. `help/commands.md`: add the `image` row in its alphabetical place (between `hist` and `launcher`).

## Tests

- `src/plugins/image/activate.test.ts`: the fake capabilities record `openClaimedFiles` targets instead of throwing; new `image plugin command` tests: the whole argument is handed to `openClaimedFiles` and no tab is opened directly; a bare command throws `TabPluginRejection('Usage: image <path>')` and opens nothing.
- `src/open/file-manager.test.ts`: new test that a pinned `image` command refusing a text file reports `image: <path>: not an image file`.
- `src/commands.test.ts` already checks that every command has a help page and that the commands table is sorted; it covers the new row and page.

## Spec and docs

- `product/specs/open.md`: the image opener section stops saying the plugin claims no command; add an `### image <path>` subsection matching `### pdf <path>`.
- `product/specs/tab-plugins.md`: the bundled image plugin section says it declares no command; state that it contributes `image <path>`.
- `product/specs/image-tab.md`: the opening sentence names `open` as the only way in; mention `image <path>`.
- `documentation/user-documentation/tab-types/image-viewer.md`: one sentence that `image <path>` does the same as `open <image>`, mirroring the PDF viewer page.
- `documentation/user-documentation/tab-types/opening-files.md`: the paragraphs listing the `video`, `audio`, and `pdf` commands' wildcard rules, usage, and refusal messages add `image`.
- `documentation/user-documentation/command-bar/plugins.md`: the list of plugin commands adds `image`.

## Out of scope

- Image edit actions as `image` subcommands (`image rotate left <file>`), a separate backlog issue.
- Any change to `open`, `edit`, or the image tab itself.
