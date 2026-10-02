# `play` reaches the video and audio plugins, and never falls back to a recording for them

**Complexity: 2/10** — one field on two manifests, one guard, and the tests that pin both. The seam this needs was built for it: `play` already resolves a file through the same opener registry `open` uses, and asks the plugin that owns the type whether its types are playable. Nothing new has to be designed or built, only declared.

`playable` is on the asciicast plugin alone, so `play clip.mp4` and `play song.mp3` are still
`not a playable file` — which is right for now and is the whole of the backlog entry asking for them to
be playable instead. Both plugins already own a command (`video <path>`, `audio <path>`) and both
already route that command into their own inline opener, so a file reaching the opener *is* reaching
what the command does: a video tab for a playable container, and a track queued into the single audio
playlist for a track. Declaring the types playable is the whole change.

Making them playable also exposes a defect the asciicast-only world hid, and the two belong in one
commit because neither is shippable without the other.

## Design decisions

**A plugin declaring its types playable is answered through its opener, not by re-running its command.**
`play x.mp4` and `video x.mp4` open the same tab because the `video` command's handler is
`openClaimedFiles` — which the host resolves by running the ordinary `open` pipeline pinned to the video
opener, ending at the same `opener.inline`. Dispatching to the opener directly is one path rather than
two: a second route into the command registry would mean a second way to resolve a path, expand a
wildcard, and report a refusal, all of which `play` would then have to keep in step.

**`play` still takes one file.** The `video` and `audio` commands accept wildcards, and `play` does
not. That was settled when `play` was built and this entry does not reopen it; `play *.mp4` is
`not a playable file`, exactly as a wildcard-bearing command is the way to open several.

**An external-only container is still playable.** Video claims MKV, AVI, WMV, FLV, MPG and MPEG with no
content type, and audio claims WMA, so their inline presentation hands the file to the configured
player rather than opening a tab. `play x.mkv` therefore launches the player's own window instead of
refusing, which is what playing that file can honestly mean and what `open x.mkv` already does.

**The recordings-directory fallback is confined to recordings.** `play` looks for a recording of the
name it was given only when the file it named is not there, and the name it looks for is that file's
stem. That was harmless while `.cast` was the only playable type — a `.cast` target's stem is a session
name and a stem with no extension is a bare session name, so the search could only ever find a
recording. With `.mp4` playable, `play home.mp4` on a machine that does not have `home.mp4` but does
have a recording of a session named `home` would silently play that recording instead of reporting the
missing video. The search now runs only for a target that names no extension or names a `.cast`, so
every other playable type reports `no such file` and nothing else.

## What already exists (reuse, don't rebuild)

| Piece | Where |
| --- | --- |
| The flag that opts a plugin's claimed types into `play` | `playable?: boolean` in `src/plugins/api.ts`, and `playablePluginForExtension` in `src/openers/index.ts` |
| What `video <path>` actually does | `capabilities.openClaimedFiles` in `src/plugins/video/activate.ts`, resolved by the host to the same `opener.inline` |
| What `audio <path>` actually does | the same, ending in `queue` — the singleton playlist's append |
| The stem a target names | `recordingStem` in `src/play/recording-search.ts` |

## Proposed changes

- `src/plugins/video/manifest.ts`: `playable: true`, with the external-only containers named in the
  comment so the flag reads as the deliberate claim it is.
- `src/plugins/audio/manifest.ts`: `playable: true`.
- `src/play/run.ts`: the recordings-directory fallback runs only for a target with no extension or a
  `.cast` one. The refusal wording is untouched — a missing video is still `no such file`.

## Tests

`src/openers/index.test.ts`, extended:

- **answers the video and audio plugins for their own containers**, so `.mp4` is `video`, `.mp3` is
  `audio`, and each still answers case-insensitively.
- **still answers undefined for a type no player claims**, keeping the image plugin and the core editor
  out.

`src/play/run.test.ts`, extended:

- **routes a video and an audio file to the plugin that plays that kind of thing.**
- **does not fall back to a recording for a missing video**, so `play home.mp4` with no such file
  reports `no such file` even when a session named `home` has a recording — the case the two changes
  exist together for.
- **still falls back for a `.cast` target**, so the search is narrowed and not removed.

`src/plugins/video/activate.test.ts` and `src/plugins/audio/activate.test.ts`: each pins its manifest's
`playable` beside the registration assertions those files already make.

## Specs

- `product/specs/tab-plugins.md`: the video and audio plugin sections say which of their types `play`
  reaches, and which are handed to an external player instead.
- `product/specs/open.md` § `play` command: the set of playable types, and that the recordings search
  answers only a name and a `.cast`.
- `product/specs/video-tab.md` and `product/specs/audio-tab.md`: a line each on the other route into the
  same tab, beside the `open` and `<command>` routes those specs already list.

## Out of scope

- **Recording agent tabs.** The other backlog entry, and one this change does not touch.
- **Wildcard expansion for `play`.** `video <path>` and `audio <path>` keep it; `play` does not gain it.
- **Which containers are playable in a browser.** The video plugin already splits them into playable and
  external-only, and this change routes to that split rather than re-deciding it.
- The audio playlist's own behavior — singleton tab, queueing, dropping an undecodable track — none of
  which changes; `play` reaches it by the same path `open` does.
- `play`'s usage line and its three refusals, none of which change wording.

## Verification

`./scripts/run.mjs check-diff`.