# Name the tab a notification line comes from, rather than its label

**Complexity: 2/10** — one lookup already in `notify`, one optional field on the queue's record, one line in the toast, and two test files.

## Goal

`notify` receives a tab's **label** and uses it for two different jobs: looking the tab up (colour,
focus suppression) and naming the line. A plugin tab's label is a unique key derived from its prefix —
`sql`, then `sql-2` — while the name its tab strip shows, and the title its payload supplies, is the
database: `shop`. So every line the `sql` tab reports reads `● 1:19pm sql: no such table: nosuchtable`
while the tab it came from is `shop`, and with two databases open the feed shows `sql` and `sql-2` and
neither says which database a failure or a row count came from.

`product/specs/sql-database.md` promises the opposite: "attributed to the database's tab, so it reads
`● 8:32pm shop: …` with the tab's colour on the dot."

`notifyUser` already holds the tab record, and the fix does not belong there: it hands `notify` a
label because that is what identifies the tab, and `notify` is the one place that decides what a line
reads. The tab strip already answers the naming question, at `web/src/TabItem.tsx:47` —
`tab.editor?.name ?? tab.title ?? tab.label` — and the feed should agree with it. An editor tab's
`title` is its file's name, so an `editor-suggest` line names the file rather than saying `editor`:
the same rule, not a second one.

## Approach

Resolve the tab once in `notify` and use `tab.title ?? tabLabel` for everything the line *reads* — the
provenance header, the message body, and the toast. Keep the label for everything the line *is*:
`shouldNotify`'s focus rule, the colour lookup key, the record file's `tab`, and the identity a
sequential repeat folds on. Those are two `sql` tabs folding separately that matter more than one
shared name reading well, and the label is what a user can grep the record for.

Carrying the name on the notification is what keeps the toast and the feed line from disagreeing:
`deliverNotification` leads a toast with the same name the feed line leads with, per
`product/specs/notifications.md`. The field is optional and absent means the label, so nothing else
about a notification changes.

## Implementation steps

1. **`src/notifications/index.ts`** — in `notify`, hold the tab the colour lookup already fetches,
   derive `name` from its `title` falling back to the label, and lead the header and
   `notificationText` with `name`. Set the notification's new `tabName` only when it differs from the
   label, and say in the function's comment why the two are not the same field.
2. **`src/notifications/queue.ts`** — add `tabName?: string` to `RecordedNotification` and correct
   `tabLabel`'s comment, which currently claims the label is what the feed line and the toast lead
   with.
3. **`src/notifications/deliver.ts`** — lead a toast with `tabName` when the notification carries one.

## Tests

- `src/plugins/notify-user.test.ts` — the fixture builds the plugin's own tab as
  `{ label: 'sql', title: 'shop' }`, the pair `addPluginTab` actually produces, and the attribution
  cases assert the label `sql`: what `notifyUser` resolves and hands on is which tab the line is
  about, and the name it reads as is `notify`'s decision. The suite can no longer pin a `label: 'shop'`
  the application cannot produce.
- `src/notifications/index.test.ts`, in `notify — line composition` — a plugin tab labelled `sql`
  with the title `shop` produces a header of `8:32pm shop` carrying that tab's colour, while the
  queue entry and the record still name it `sql`; a tab with no title reads as its label, which is
  the fallback the tab strip has too. In `notify — surface routing` — a toast for that tab leads with
  `shop`, not `sql`.

## Spec

- `product/specs/notifications.md` — "Ordering and timestamps" says the header carries the originating
  tab's *label*. It carries the name the tab strip shows, which for most tabs is the label and for a
  plugin tab is what the tab is about. "Toasts and escalation" follows the same wording.
- `product/specs/sql-database.md` — no change: it already promises the database's name, and this is
  what makes that promise true.
