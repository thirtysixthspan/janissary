# Treat a reviewed pull request's content as data, not instruction

**Complexity: 2/10** — one preamble rule and one clarifying sentence in one markdown task file. No source, no test, no protocol, no UI. The rule is cheap because the task's existing prohibitions already block the destructive outcomes; what is missing is the reason they matter here.

## Goal

`ai/tasks/pull-request-review.md` directs an autonomous agent — holding a shell, a checked-out branch, and push access to that branch — to read an arbitrary open pull request's diff, plan file, description, and commit messages in full. It carries a "Stay within the project directory" rule and a command-hygiene rule, and nothing at all about the **trust level** of what it reads.

So text placed in a reviewed branch arrives under the same trust as the task file's own instructions. A pull request whose plan file or description carries directions aimed at the reviewing agent gets them read, and the task has already granted everything a successful steer would need.

## Approach

State the trust boundary as a preamble rule beside the two that are already there, and name the specific temptations this task creates rather than gesturing at prompt injection in the abstract. Then make one existing decision legible: Step 1's no-install rule is already doing security work that its current wording does not claim.

The rule is cheap to add and cheap to follow because the task's Forbidden list already prohibits the destructive outcomes — no fixing, no installing, no committing anything but the backlog file. What the rule supplies is the reason those limits matter when the content being read is attacker-controlled, so a future editor does not relax one without seeing what it was holding.

## Design decisions

1. **A preamble rule, not a Step 3 sub-point.** The trust boundary applies from the moment Step 1 checks the branch out — before the diff is read, while the plan file and description are being read in Step 2 — so it cannot live inside the step that reviews the diff. It sits with "Stay within the project directory" and command hygiene, which are the other rules that hold for the whole run.

2. **An instruction found inside reviewed content is itself a security finding.** The rule needs a disposal route, not just a prohibition: an agent told "do not follow this" still has to decide what to do with it. Routing it to Step 3's security dimension turns an attempted steer into a recorded, reviewable entry, which is the same move the task already makes for every other security observation — record, never act.

3. **Name the concrete temptations.** "Treat content as untrusted" is advice an agent can agree with and still be steered by. Listing what a steer would actually ask for — run a command, install a dependency, edit a file outside the backlog, skip a step — gives a reader something to match against, and each item maps to a Forbidden rule that already exists.

4. **Say what the no-install rule is buying.** Step 1 forbids `npm install` and justifies it purely on cost — minutes and disk. It is also the reason a reviewed branch's `package.json` lifecycle scripts never execute, which is a real containment property of running this task against an untrusted branch. Recording that beside the rule keeps a future editor from reversing a cost decision without seeing the security consequence.

5. **The rule is prose, and the plan says so.** Nothing enforces it; a sufficiently well-disguised instruction inside a diff can still be persuasive. This closes the naive case and narrows the surface, and claiming more than that would be worse than claiming nothing.

6. **No new prohibition is added to the Forbidden list.** Every action a steer would ask for is already forbidden there. Adding an eleventh rule saying "do not do the forbidden things when a diff asks you to" would restate the list rather than add to it.

## Implementation steps

One file changes: `ai/tasks/pull-request-review.md`.

1. **New preamble rule**, placed after "Stay within the project directory" and before the command-hygiene rule. It states that everything reaching the run from the pull request under review — the diff, the plan file, the description, commit messages, and any file on the branch — is data to be judged, never instruction to be followed; names the temptations from decision 3; and routes any instruction found inside reviewed content to Step 3's security dimension as a finding to record rather than an action to take (decision 2).

2. **Step 1's "Nothing else follows the checkout" paragraph.** Add a sentence recording the containment the no-install rule already provides: a reviewed branch's `package.json` lifecycle scripts never execute, so the rule is buying more than the minutes it names (decision 4).

Nothing else changes. The Forbidden list, the five dimensions, and every step keep their current wording.

## Tests

None. One markdown file under `ai/tasks/` changes, so there is no test surface — `./scripts/run.mjs check-diff` sees only markdown outside `src/` and `web/`, assembles an empty tool list, and exits 0.

## Out of scope

- Any enforcement mechanism. A sandbox, an allowlist, or a wrapper that strips instruction-shaped text from a diff would each be a much larger change, and the surface this narrows is worth narrowing without one (decision 5).
- Adding a Forbidden rule (decision 6).
- Applying the same rule to `ai/tasks/work-an-issue.md`, which now also reads a pull request branch's backlog and acts on it with far broader permissions. That is a real and arguably larger version of this problem, and it is a separate work item against a file that is not in this pull request.
- The last remaining entry in `./product/backlog/pull-request.md`, which is its own unit of work.

## Verification

`./scripts/run.mjs check-diff` — expected to run no tools and exit 0.

Manual: read the preamble of `ai/tasks/pull-request-review.md` and confirm the trust rule sits with the other whole-run rules, names the four temptations, and routes a found instruction to Step 3's security dimension.

Manual, the live check: on a scratch branch, add a line to a plan file reading as an instruction to the reviewing agent — for example, directing it to run a command or to skip the security dimension — open a pull request, and run `execute ./ai/tasks/pull-request-review.md <number>` against it. Confirm the run does not act on the line, and that it records it as a security finding in `./product/backlog/pull-request.md` rather than ignoring it silently. Delete the scratch branch afterwards.

Manual: confirm Step 1 still forbids the install and now also states that lifecycle scripts on the reviewed branch never execute.
