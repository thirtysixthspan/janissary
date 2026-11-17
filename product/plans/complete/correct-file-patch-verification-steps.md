# Correct the file patch verification steps for the launch shell and seeded roles

**Complexity: 1/10** — 0 added lines, 0 production files, 2 requirements and 2 verification scenarios (p=2.76); a description-only correction with no code change.

## Goal

Correct two expectations in the `file patch` pull request's **How to verify** section. Setup step 3 describes an empty transcript where the tested build opens the `janus` launch shell. Happy paths step 8 says a saved roles file lacks `file patch` where a freshly seeded file already grants it.

## Approach

The tested behavior already matches the code and the functional specs. The launch opens one zsh shell tab labelled `janus` in the project directory, its metadata row reads `$root/`, and its shell command bar holds focus (`src/launch-shell.ts`, `product/specs/shell-tab.md`). When neither roles file exists, the Roles tab creates `~/.janissary/roles.json` from `DEFAULT_ROLES`, whose tell role includes `file patch` among sixteen native commands and whose ask role lists ten without it (`src/plugins/roles/roles-file.ts`, `product/specs/roles.md`). Only the description text is wrong.

Rewrite the two named paragraphs. Leave every other paragraph byte-for-byte and do not change the title. Apply the body after the commit is pushed.

## Implementation steps

1. Replace Setup step 3 in the description body with: "The screen shows the launch shell: one local shell tab labelled `janus`, rooted at `patch-demo` with `$root/` in its metadata row, a zsh prompt in its terminal, and focus in its shell command bar. Before each step, reset the fixture files to the contents above unless the step says it continues from the previous one."

2. Replace the Expectations paragraph in Happy paths step 8 with: "Expect: A `file patch` row appears under `file` after `file edit`. A freshly seeded roles file already includes `file patch` in its tell role, which has sixteen native commands; the ask role's ten do not include it. A roles file saved by an older build keeps its old grants, so its tell role lacks `file patch` and **Add command** offers it after `file edit`."

3. Promote this plan and remove the resolved backlog entry, restoring the comment-and-heading skeleton because it is the only entry.

4. Commit and push the plan and backlog changes, then read the pull request body, apply the two replacements in a body file under `temp/`, and update the description with `gh pr edit --body-file`.

## Tests

No automated test applies because no behavior changes. Verify the description against the running build instead:

- Fresh scratch home: the launch screen shows one tab labelled `janus`, metadata `$root/`, a live zsh terminal, and the shell command bar focused. The Roles tab reads `Editing <home>/.janissary/roles.json`, and tell lists sixteen commands including `file patch` while ask lists ten without it.
- A roles file written without `file patch`: the Roles tab reads that file, tell lists fifteen commands, and the tell role's **Add command** picker offers `file patch`.

Reading the corrected body back after the edit should show both paragraphs as written and every other paragraph unchanged.

## Out of scope

- Changing the launch screen, the roles seed, the Roles tab, or any other production behavior.
- Editing the functional specs, help pages, or user documentation, all of which already describe the observed behavior.
- Changing the pull request title, its other sections, or merging the pull request.
