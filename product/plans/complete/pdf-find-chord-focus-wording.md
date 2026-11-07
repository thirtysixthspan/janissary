# State the focus condition for the PDF find chord

**Complexity: 4/10** — a wording-only correction across a spec paragraph, two design decisions in the completed feature plan, one manifest comment, and one pull-request description sentence. No code or test changes; the care is in describing the existing claim lifetime exactly without overstating what `active` means.

## Goal

The active-tab repair and the find feature both describe `Cmd+F` as belonging to a PDF tab while that tab is active, which is true of overlay availability but not of chord answering. `chordTabLabel` in `web/src/useWindowKeys.ts` routes a claimed chord by the focused tab label: focus on the page itself names the current plugin tab, while focus inside any labelled tab names that tab. `usePluginChordClaims` in `web/src/plugins/PluginChords.tsx` registers a claim while the host reports the tab active. `PluginTabLayer` passes `active` only to the current centre tab; `DockedPluginBody` passes `active={isVisible}`, so a docked tab stays claimed for as long as its sidebar shows it even when focus is elsewhere.

The result is that a docked PDF tab with focus elsewhere does not answer `Cmd+F`, yet keeps its claim registered, and the chord falls through to the application. Three places still say otherwise:

- `product/specs/pdf-tab.md` § Find's loading paragraph says `Cmd+F` is answered while the tab is active, while the opening paragraph of the same section already names the focus condition.
- `product/plans/complete/pdf-tab-find.md`'s first design decision and its claim bullet treat active or visible as sufficient for answering, and the second design decision says the claim returns the moment another tab is focused.
- `src/plugins/pdf/manifest.ts`'s comment says the chord is honoured only while a PDF tab is visible, is taken back the moment focus moves, and describes the handler as falling through when it does not answer.

The pull request body repeats the visible-only wording in its What section.

## Approach

Correct the prose to match the code, not the other way round. The spec's opening paragraph and its last paragraph already state the right rule, so the loading paragraph is qualified with the same active-and-focus wording and keeps its loading, failure, and overlay-clear sentences. The plan's first design decision separates overlay availability (active) from chord answering (focused label), and the claim bullet states the claim's actual lifetime: active while current in the centre, active while its sidebar shows it when docked, with only the focused label running the handler. The second design decision's release rule is corrected alongside it so the two decisions cannot contradict each other. The manifest comment names the active rule, the real release rule for each placement, and that a handler with nothing to open while loading or failed still consumes the chord. The pull request body's one sentence gains the same wording after the push.

## Implementation steps

1. In `product/specs/pdf-tab.md` § Find, qualify the loading paragraph: `Cmd+F` is answered while the tab is active and the chord reaches it — the current tab among the centre panes, or a PDF tab shown in a sidebar while focus is inside it. Keep the sentences about doing nothing visible before load or after failure, the browser find bar not opening, and a failure closing an open overlay and clearing its marks.
2. In `product/plans/complete/pdf-tab-find.md`, rewrite the first design decision so active makes the overlay available while answering follows focus, rewrite the second design decision's release rule to a centre claim moving with the current tab and a docked claim lasting while its sidebar shows it, and rewrite the "claim is registered whenever the tab is active" bullet to say the docked tab stays claimed while visible but only the focused label runs it, and that loading and failed states consume the chord without opening anything.
3. In `src/plugins/pdf/manifest.ts`, replace "visible one" with "active one", replace "takes it back the moment focus moves" with the release rule for centre and docked claims, and state that a handler that no-ops while loading or failed still consumes the chord.
4. Run `$janissary/scripts/run.mjs check-diff` after each change.
5. After the push, update the pull request body's "chord belongs ... only while that tab is visible" sentence to the active-and-focus wording, preserving every other paragraph.

## Tests

No automated tests. The fix changes comments and prose only; there is no executable surface to cover. The behavior the prose now describes is already pinned by the existing `PdfTab.test.tsx` active-false case and the chord-routing cases in `web/src/useWindowKeys.test.ts`, and both must keep passing under `$janissary/scripts/run.mjs check-diff`.

## Out of scope

- Changing `chordTabLabel`, `usePluginChordClaims`, `PluginTabLayer`, `DockedPluginBody`, or any other code or test.
- Changing the manifest's `chords` declaration or any other manifest field.
- Changing the spec's opening paragraph, its last paragraph, or any other section; they already state the rule correctly.
- Editing any other sentence in the pull request description, or its title.
- The other four entries in `product/backlog/pull-request.md`.
- Restating the claim lifetime in the user documentation; it does not describe the claim rule.

## Verification

- `$janissary/scripts/run.mjs check-diff`
- `npm run test:client -- web/src/plugins/pdf/PdfTab.test.tsx web/src/useWindowKeys.test.ts`
- Manual: read `product/specs/pdf-tab.md` § Find and confirm its opening, loading, and final paragraphs all state the same active-and-focus rule; read the two amended design decisions and the claim bullet and confirm they agree with `chordTabLabel` and `usePluginChordClaims`; confirm the manifest comment names the active rule, both release rules, and the loading and failed consumption. After the push, confirm the pull request's corrected sentence names the active-and-focus rule and every other paragraph is byte-for-byte unchanged.
