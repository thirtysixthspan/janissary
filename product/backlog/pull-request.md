<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Share one command-name normalizer and longest-form matcher between the server inventory, the settings decoder and the browser instead of keeping separate copies.

Existing Issue: The whitespace and case normalizer plus the longest-form and canonical-form tie-break matching are written out separately in `src/application-commands.ts`, `src/native-commands/decode.ts` and `web/src/shared/command-availability.ts`, so the rules for which row owns an input exist in three places. Severity: 4/10

Existing Risk: 5/10 - The plan requires the client's disabled-command match to agree with the server's resolver, and a tie-break change made in one copy would let a shortcut or command-bar line be blocked or allowed on the client while the server decides otherwise, which no test compares directly.

Proposal Risk: 3/10 - The shared module must stay import-free to remain browser-safe, so a mistake there changes server resolution and client gating together, though the existing tests on both sides would catch most mistakes.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1968 "share one command-name normalizer and form matcher across server and client". Add a pure, import-free module next to `src/shared/application-commands.ts` exporting `normalizeCommandName`, a form-boundary predicate and the longest-form and canonical-form ranking, typed over rows that carry `name`, `aliases` and `forms`. Replace the local copies in `src/application-commands.ts`, `src/native-commands/decode.ts` and `web/src/shared/command-availability.ts` with imports through the `@shared` alias, leaving `resolveApplicationCommand`'s search-owner special case on the server only. Keep `src/application-commands.test.ts`, `src/native-commands/decode.test.ts` and `web/src/shared/command-availability.test.ts` passing unchanged, and add a parity test that runs the same inputs, including `question ask`, `ask reset`, `search transcript` and `browser goto`, through the server resolver and the client matcher.
