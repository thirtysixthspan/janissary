# Attribute the sql tab's notifications to the tab

**Complexity: 3/10** — one optional field on a plugin capability, resolved by the host to one of the plugin's own tabs, and the sql plugin passing it on every line it reports.

## Goal

Every other notification reads `● 8:32pm <tab>: <message>`, with the dot in the tab's colour, so the feed says where each line came from. A line the sql tab reports — a statement's result, a row count, a failure — reads `● 8:32pm : <message>` with no tab and no colour, which is not the feed's format and does not say which database tab it is about.

The cause is where the sql plugin reports from. Its answers arrive on the `databases` topic, so every line is said from its `notify` handler, and a topic notification runs under the host's background origin, whose label is empty. `notifyUser` attributes a line to the origin's label, so the line is attributed to nothing.

## Approach

Let a plugin name which of its own tabs a line is about. `notifyUser` gains an optional `tab` option: an instance key, addressed exactly as `updateTab`, `dockTab`, and `snapshotTab` address one. The host resolves it among the plugin's own tabs and attributes the line to that tab's label, which gives it the tab's name and dot colour through the ordinary `notify` path. A key the plugin has no open tab for falls back to the invoking tab, as the line did before, so a plugin never has to track which of its tabs the user has since closed.

This stays inside the capability's narrowness: a plugin can name only a tab it owns, never another plugin's tab or an agent's, and still cannot choose the event type or a tab to jump to. It is an additive optional field, so the API stays v1.

The sql plugin passes the instance key of the tab the answer was folded into on every line it reports: a failure, a statement's result, and a row count.

The line's body is unchanged here. What a statement's result puts in the line — today the whole shortened result — is the next backlog entry's change, which moves it to a file the line links to.

## Implementation steps

1. **`src/plugins/api.ts`** — `notifyUser(text, options?: { openFile?: string; tab?: string })`, and the comment says what `tab` addresses.
2. **`src/plugins/context.ts`** — `notifyUser` resolves `options.tab` with `managers.tab.pluginTabByInstanceKey(declaration.id, tab)` and uses that tab's label, falling back to the origin's.
3. **`src/plugins/sql/activate.ts`** — `report` and `say` take the tab's key and pass `{ tab: key }` with every line.
4. **`documentation/developer-documentation/tab-plugins.md`** — the `notifyUser` entry describes `tab`, and the v1 changelog notes the additive option.

## Tests

- `src/plugins/notify-user.test.ts` (new) — a line naming one of the plugin's own tabs is attributed to that tab's label and colour; one naming a key the plugin has no tab for falls back to the invoking tab; one naming another plugin's tab is not attributed to it; `openFile` still rides along.
- `src/plugins/sql/activate.test.ts` — every reported line carries `{ tab: 'sqlite:shop' }`: a failure, a short result, a long result with its file, and a row count.

## Spec

- `product/specs/sql-database.md` — the console section says each notification is attributed to the database's tab, read as the tab's name and colour like any other line.
- `product/specs/tab-plugins.md` — the `notifyUser` capability's `tab` option, if the spec lists the option set.

## Out of scope

- The body of a statement's result notification (the next entry).
- Letting a plugin choose a tab for the line to focus when clicked.
