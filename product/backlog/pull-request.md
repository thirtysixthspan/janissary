<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the spec's claim that the tab does not follow a foreign key, which the same spec describes in detail two sections earlier.

Existing Issue: `product/specs/sql-database.md` describes the foreign-key control in its filtering section — "Activating it selects that table filtered to the value" — and then lists "It does not join tables, follow a foreign key, or build a query." under "What it does not do", and `product/specs/database.md` still advertises the browsing surface as offering "per-column statistics, the SQL behind the current view", neither of which this branch builds. Severity: 4/10

Existing Risk: 3/10 - A spec is what a reader trusts when the description and the code disagree, so a contributor reading that the browser does not follow a foreign key will not find the working control, and one reading that it has a statistics panel will look for a panel that was deliberately removed.

Proposal Risk: 1/10 - Prose only, so the only thing that can go wrong is a sentence describing behaviour the next change alters again.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1467: correct the spec's claim that the tab does not follow a foreign key". In `product/specs/sql-database.md`, remove the foreign-key clause from the "What it does not do" list, keeping the joins and query-builder parts of that sentence, and add a clause naming foreign-key following as something the tab does, so the two sections agree. In `product/specs/database.md`, drop "per-column statistics, the SQL behind the current view" from the browsing-surface sentence, which `product/specs/sql-database.md` already contradicts with "There is no statistics panel" and "It does not show the statement behind the grid". No code or test changes; the behaviour was observed working in the pull request's own fifth testing step, where the key cell is titled `orders.id` and selecting it shows the referenced table filtered to that value.


* Correct the pull request's second testing step, which cannot be completed without a **Refresh** it does not name.

Existing Issue: The description's second **How to verify** step ends its first sentence with pressing **Refresh**, but its next sentence — adding a `CREATE VIEW`, a `CREATE INDEX` and a `CREATE TRIGGER` through the console and confirming each appears under its own group — does not, and the navigator still reads only `Tables` until **Refresh** is pressed. Severity: 3/10

Existing Risk: 3/10 - The step is how a reader checks that views, indexes and triggers are discoverable at all, so following it exactly reports the pull request as missing two of the three object kinds when all three are present.

Proposal Risk: 1/10 - One clause of prose, and the behaviour it describes is deliberate and already specified.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1467: correct the second testing step's missing Refresh". Observed: on a database seeded with `orders`, run `CREATE VIEW paid AS SELECT id, customer, total FROM orders WHERE status = 'paid'`, `CREATE INDEX orders_status ON orders(status)` and `CREATE TRIGGER orders_touch AFTER UPDATE ON orders BEGIN SELECT NEW.id; END;` in the console, in that order. The table dropdown then reads only `Tables`. Press **Refresh** and it reads `Tables,Views,Indexes,Triggers`, with `paid` under Views, `orders_status` under Indexes, and `orders_touch` under Triggers as an option that cannot be chosen. `product/specs/sql-database.md` states "the schema is re-read only when a `Refresh` is pressed", so the app is right and the step is what is wrong. Read the current description body with `gh pr view 1467 --json body`, and in that second bullet's second sentence put **Refresh** in the same way the first sentence does — "and a **Refresh**, then confirm each appears under its own group" — leaving every other paragraph exactly as the author wrote it and the title untouched. Apply it with `gh pr edit 1467 --body-file` after the commit is pushed, never before.
