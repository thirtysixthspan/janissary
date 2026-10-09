<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Declare the three capabilities the launcher's activation reaches for, so `launcher` opens a tab instead of disabling the plugin.

Existing Issue: The launcher's manifest named eight capabilities and its activation reaches for eleven — `originTab`, which `readCommands` calls for the project root, and `startAcp` and `promptAcp`, which the summarizer's flush calls. An undeclared capability is not refused at activation; it is replaced by a stub that throws, so the plugin was disabled the first time anyone typed `launcher`, and the feature produced no tab, no rail, and no error the user could see. Severity: 10/10

Existing Risk: 10/10 - The feature does not work at all, and the failure is silent: the only signal is a `Tab plugin "launcher" disabled` line in a terminal-rendered transcript that a browser user has no way to read. Every unit test passed, because the tests drive the activation with a stub that happily supplies every capability.

Proposal Risk: 1/10 - The manifest now names what the code uses, which is the whole of the change; a capability that stops being called simply stays declared until someone trims it.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1627 "declare the capabilities the launcher's activation reaches for". Add `originTab`, `startAcp`, and `promptAcp` to `src/plugins/launcher/manifest.ts`'s capability list. Then close the hole the test suite left, because a stub that supplies everything cannot catch this and the next plugin will make the same mistake: add a case to `src/plugins/declaration-validation.test.ts` that reads `src/plugins/launcher/activate.ts` out of its own source, collects every `capabilities.<name>(` it calls, and asserts that set is a subset of the declared list — the same shape the shell-plugin case in that file already uses, with a comment recording that the launcher hit it.

