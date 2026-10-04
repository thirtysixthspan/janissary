# Correct the description's claim about bare `theme` in a shell tab

**Complexity: 1/10** — one paragraph of a pull request description, and one test that pins what the corrected text claims.

**Goal.** The description's summary table says a bare `theme` opens the theme picker in a shell tab, and the same description's manual-test section says bare `theme` is claimed by the application and its answer is appended to a transcript a shell tab never draws. The two halves of one document disagree, and the table is the half a reviewer reads first.

**The remedy the backlog entry names is now inverted, and the reason is the previous entry.** The entry was written against the code as it stood: the interception that opens a bare word's picker lived in the agent tab's submit chain, so a shell tab really did send `theme` to the dispatcher and really did show nothing. Extracting that interception into `classifyCommandBarSubmit` and publishing it to plugin bodies — `fix(shell): confirm quit and a last-tab close from a plugin tab's bar` — made the table's claim true. `product/specs/shell-tab.md` already said `theme` opens the theme picker, so that entry aligned the code with a spec that had been written first.

Which half is false has therefore swapped. The entry's own framing is what decides what to do about it: *"the two halves of one document disagree, and the table is the half a reviewer reads first."* The disagreement is the defect; which half carries it is incidental. So the table row is kept and made precise about which picker it opens, and the manual-test aside is corrected to say what now happens. Rewriting the table instead, as the entry proposed, would leave the document disagreeing with itself in the other direction.

## Implementation

1. The `theme` row of the summary table: name the picker the bare word opens, which is the application-wide one — `theme` is `openAppThemePicker` in the shared table, and `syntax theme` is the separate spelling that opens the syntax picker. The row's "first refusal on every line" is now accurate too, since every line goes through the interception before it is offered onward.
2. The `Ctrl+C` rows: `controlKeyOf` declines any chord carrying Shift or Meta, so `Ctrl+Shift+C` is not the shell's and reaches the application. The row's scope says so.
3. The manual-test aside under case 3: replace the claim that bare `theme` answers into an invisible transcript with what it does — it opens the theme picker — and keep `theme dark` as the argument form that runs a command, and `!theme` as the way to send the word to the shell.

## Tests

`web/src/plugins/shell/ShellTab.test.tsx` gains the case the corrected text now claims: a bare word in the shared table opens its own picker in a shell tab and is not offered to the server at all, and a claimed word carrying an argument still is. The harness's overlay openers become spies so the case can tell *which* picker opened rather than only that something intercepted the line.

Without this, the description's central claim rests on nothing executable.

## Out of scope

- Any behaviour change. The entry is explicit that this is a description fix, and the behaviour it describes is now correct because of the previous commit rather than because of anything here.
- The title, and every other paragraph. They are the author's statement of intent and the evidence the next reviewer needs.
- The `Up`/`Down` row, which still says the bar walks the lines it has sent — true whenever the history popup is closed, and the popup taking those keys while it is open is the subject of a separate entry.