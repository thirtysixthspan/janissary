# Correct the ask and tell help pages' web-access sentence

**Complexity: 1/10** — no production code, no production files edited, no test scenarios; two one-sentence help-page corrections (p=2.35).

## Goal

`help/ask.md` and `help/tell.md` each carry a note bullet that reads "The agent has no built-in tools: no shell, file, or web tools of its own. It can only run the granted native commands. Its web access is the granted `web search` command, which needs a provider token."

The last sentence claims the agent's only web access is the `web search` command. The same page's grant list contradicts that: the default `ask` role grants `browser goto` and `browser content`, and the default `tell` role grants those plus `browser eval`, all of which reach the web. A reader can only conclude that the granted browser commands do not count as web access, which undercuts the grant model the bullet is explaining.

The sentence should describe the search grant rather than characterize all web access: "Its web search is the granted `web search` command, which needs a provider token."

## Approach

Change the final sentence of that one note bullet in each of the two pages. The two sentences before it, the rest of the bullet list, and every other line of each page stay byte-for-byte.

The claims are already correct everywhere else:

- `src/plugins/roles/roles-file.ts` — the built-in `ask` role lists `browser goto`, `browser content`, and `web search`; the built-in `tell` role lists `browser goto`, `browser content`, `browser eval`, and `web search`.
- `src/plugins/roles/shared.ts` — `NATIVE_ACP_COMMANDS` carries `browser goto`, `browser content`, `browser eval`, and `web search` among the native commands a role can grant.
- `help/ask.md` describes the browser access in the preceding bullet: the default ask role can "browse to a page and read its content".
- `help/tell.md` describes it in its first note bullet: the default tell role has "browser goto, content, and eval".

So the corrected sentence keeps the true claim — the search grant needs a provider token — and stops implying that the browser grants are not web access.

## Design decisions

1. **Name the command's subject instead of broadening the sentence.** The bullet is about grants, so "Its web search is the granted `web search` command" says what the grant is for. A broader phrasing such as "Its web access is limited to the granted native commands" would be true but would repeat the bullet's first two sentences without naming the provider-token requirement.

2. **Keep "which needs a provider token."** That requirement belongs to `web search` alone; the browser grants need no token. Keeping the clause attached to the search sentence keeps it accurate.

3. **Correct both pages.** The notes are parallel, and fixing only one would leave the same false claim on its sibling.

4. **No spec, code, test, or other help page change.** `product/specs/roles.md` and `product/specs/acp.md` already state the browser and search grants correctly, and no other page carries this claim. The correction is prose, so there is no test surface.

## Implementation steps

1. In `help/ask.md`, change the note bullet's last sentence from "Its web access is the granted `web search` command, which needs a provider token." to "Its web search is the granted `web search` command, which needs a provider token."
2. In `help/tell.md`, make the same replacement.
3. Read both revised bullets against `src/plugins/roles/roles-file.ts` and `src/plugins/roles/shared.ts`, and confirm the preceding bullet describing browser access is untouched on both pages.
4. Run `$janissary/scripts/run.mjs check-diff` and confirm it exits 0.
5. Run `git diff` and confirm the only changes in each page are those two sentences.

## Tests

No automated tests. The change is prose in two help pages plus this plan and the backlog file, so there is no test surface. Run `$janissary/scripts/run.mjs check-diff` after the edit and confirm it exits 0.

Manual verification: read both revised bullets and confirm the sentence now describes the `web search` grant, the provider-token clause is intact, the two preceding sentences and every other bullet are unchanged, and the grant lists named above still match the built-in roles.

## Out of scope

- Changing any code, test, spec, or plan.
- Changing any other help page, `help/commands.md`, or any page under `documentation/`.
- Rewording the rest of the note or the pages' grant descriptions.
- The other entries in `product/backlog/pull-request.md`.
