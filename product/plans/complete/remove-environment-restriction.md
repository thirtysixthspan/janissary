# Stop ruling out environment-dependent behavior in the spec-testing task

**Complexity: 1/10** — one forbidden item, one instruction paragraph, one selection clause, and the sentences in the spec and the plan that describe them. No code, no test.

`ai/tasks/research/find-bugs.md` forbids exercising "behavior that depends on sandbox enforcement, external networks, remote hosts, credentials, or native host windows", and the same rule is enforced in two more places: Step 5 tells the run to skip that behavior and to test only the local portions of a mixed spec, and Step 2 excludes a spec whose behavior is entirely environment-dependent from the automatic five-spec selection. All three go, because the rule is one rule and leaving any of them in place keeps the restriction alive somewhere the reader has to notice it.

What is not part of the restriction and stays:

- **A failure the environment plausibly caused is not filed as a bug.** That lives in Step 6's filing rules, and it is about what reaches `product/backlog/bugs.md` rather than about what the run may exercise. Without it, every missing credential would become a backlog entry.
- **The scratch home.** The run still launches the app with its own home and its own data directories, so a behavior that needs a credential the scratch home does not carry still fails for want of one — and now that failure is reported rather than prevented.
- **Loopback, the browser, and the live session.** Unrelated rules, untouched.

The spec's "Environment-dependent behavior is skipped" becomes "a behavior the environment prevented is reported untested or unfiled rather than skipped in advance", which is the same sentence the run has always used for anything it could not reach. The plan's two design decisions — that the run may be inside a sandbox, and that the environment is not a product bug — stay as the record of what was decided; its verification status gains a line saying the first no longer holds as a rule.

## Implementation steps

1. `ai/tasks/research/find-bugs.md` — forbidden item 7, renumbering the two after it.
2. `ai/tasks/research/find-bugs.md` — Step 2's exclusion of entirely environment-dependent specs from the selection, and the sentence about partly environment-dependent specs.
3. `ai/tasks/research/find-bugs.md` — Step 5's skip paragraph, replaced by the general rule that whatever the run cannot reach is reported rather than assumed away.
4. `product/specs/task-picker.md` — the environment-skipping sentence.
5. `product/plans/complete/find-bugs-task.md` — a line in the verification status.

## Tests

None. Every assertion in `scripts/find-bugs-playbook.test.mjs` is unaffected: the removed text quotes no application literal, changes no report line, and leaves both delegations and the loopback address where they are. That the suite stays green is the check that the removal took nothing else with it.

## Out of scope

- **The filing rule in Step 6.** A divergence the environment could plausibly explain stays unfiled and named under `Not filed`. That is the rule that keeps a missing credential out of the bugs backlog, and it is a rule about recording rather than about exercising.
- **Isolating the app from real user state.** The scratch home and scratch data directories are how the run avoids touching what is real, and nothing here touches that.
- **Letting the run read the human's credentials.** A run whose app needs a credential still has none; what changes is that it tries and reports the failure instead of declining in advance.
- **Reporting.** `Not tested` and `Not filed` keep their meanings and their lines.
- **The launch task.** It says nothing about which behaviors to exercise; it starts the app and steps back.

## Verification

Automated: `./scripts/run.mjs check-diff`.

Manual: search the task and the spec for `sandbox`, `network`, `remote-host`, `credential`, and `native` and confirm each remaining mention is about the app's own state or the run's own reporting rather than a prohibition on exercising the behavior.
