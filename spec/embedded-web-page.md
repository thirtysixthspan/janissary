# Embedded Web Page

The `open` command opens a web address **inside a tab**, embedding the live page in the app (see
Open). A page tab is a passive viewer: the user browses the site within the tab and closes it
manually. It is a non-agent **view tab**, modelled on the image tab (see [[image-tab]]) but
showing a web page instead of an image file.

Page viewing is intentionally minimal. The app does not communicate with, control, script, or
read the contents of the embedded page; it only displays it. Whatever the embedded site allows the
user to do directly — click, scroll, type, follow links — happens inside the page itself.

### Opening a page

Web pages are opened through `open` (see Open → Web opener), which recognizes a web address two
ways:

- `open <url>` — an argument with an explicit `http://` or `https://` scheme is recognized as a
  web address and opened as an embedded page. Example: `open https://slashdot.org`.
- `open page <address>` — the `page` keyword forces web interpretation and supplies a default
  `https://` scheme, so a bare address works. Example: `open page slashdot.org` opens
  `https://slashdot.org`.

Only `http` and `https` addresses are viewable; any other scheme (for example `javascript:`,
`data:`, or `file:`) is rejected. An argument without a scheme and without the `page` keyword is
treated as a file path, not a web address — the `page` keyword is what makes a bare address a web
page.

By default a page opens **inline**, as an embedded page tab (below): the tab is created and
focused, and that new tab is the feedback — no transcript line is added (matching the image
opener). The external presentation instead opens the address in the OS default browser
(`open external <url>` / `open external page <address>`; see Open → Web opener).

Errors are surfaced in the active tab before any tab is created: a missing address yields the
`open` usage message; an unviewable scheme or malformed address yields a message reporting the
address is invalid.

### Page number

Every page tab is assigned a **page number** — the smallest positive integer not currently used
by an open page tab. Numbers are independent of a tab's position in the strip. When a page tab is
closed its number becomes free again and is reused by the next page, so open page tabs are always
numbered from `1` without gaps. The page number identifies the tab for `close page` and appears in
its label.

### Root domain

The tab's label uses the address's **root domain** — its registrable domain with any leading
`www.` removed. For example `www.website.com`, `website.com`, and `docs.example.com` label as
`website.com`, `website.com`, and `example.com` respectively. The full address is shown in the
page's metadata header, not in the label.

---

## Page tab

Opening a web address inline opens a new **page tab**: a non-agent tab that displays the embedded
web page, with no command bar. The tab is created like an agent tab (see Tabs) — placed
contiguously within the active tab's group, inheriting that group's number and bar color and
taking a distinct dot color. Focus moves to the new page tab.

Unlike an agent tab, a page tab has no shell, agent session, browser, transcript, or command
history, and no persisted agent state. It is a **live, in-memory view** — like image tabs and
browser windows, it is not saved and is not restored on `--relaunch`.

### Page tab data

A page tab is distinguished from an ordinary tab by a **view kind** marking it as a page view.
Alongside it the tab carries the data the view needs:

- **number** — the page number.
- **domain** — the root domain (for the label and header).
- **address** — the normalized `http`/`https` URL loaded into the view.

### Page tab layout

A page tab's body has no command bar and no transcript. When the active tab is a page view, the
app renders the page view in place of the usual transcript-and-command-bar body; every other tab
renders unchanged. Tab switching, scrolling, and the route/history overlays continue to key off
the active tab as before.

The page view shows, stacked top to bottom:

1. **Metadata** — the page's number, domain, and full address, in a compact header.
2. **The embedded page** itself, filling the space beneath the metadata and resizing with the tab.

### What renders

The app embeds external `http`/`https` sites in a page view. Sites commonly refuse to be framed by
sending framing controls in their responses — `X-Frame-Options`, or the CSP `frame-ancestors`
directive. When running in its own managed browser, the app removes those framing headers from
embedded page responses, so such sites render anyway. The page still loads directly from its real
origin, so the site's own login and session behavior is unchanged; the app only displays the page
and does not read or script its contents.

This relaxation is scoped to embedded pages and to the app's managed browser. If the app falls back
to the system default browser, a site that refuses framing may instead show a blank or blocked area.

### Tab strip: name and close button

In the tab strip a page tab reads exactly like an ordinary tab — same dot, group bar, active
highlight, and ordering — with two differences:

- **Name.** The tab's name is `<n>) <domain>` — its page number and root domain (for example,
  `1) website.com`). Per [[tab-label-no-markers]], no type or status marker is appended — the
  number and domain only.
- **Close button.** A close control is shown **right-aligned within the tab, immediately after the
  name**, exactly as for an image tab. Clicking it removes that tab without first selecting it; the
  click does not also trigger tab selection. The close button is specific to view tabs (agent tabs
  continue to close via the `close` command).

### Closing a page tab

A page tab can be closed three ways, all equivalent in their teardown:

- the tab's **close button** (the manual affordance),
- the **`close`** command when the page tab is active, and
- **`close page <n>`** — close the page tab with page number `n` from any tab.

Closing performs the same teardown the `close` command does for a non-last tab: the tab is removed
from the strip, its in-memory state is dropped, and an adjacent tab is selected. Because a page tab
owns no shell, agent session, browser, workspace, or served file, those teardown steps simply do
nothing for it. Closing the last remaining tab quits the app, exactly as the `close` command does
(see `tabs.md`).

### `close page` command

`close page <n>` — close the page tab numbered `n`.

- `close` with no argument closes the **active** tab, unchanged (see Application Commands).
- `close page <n>` closes the page tab whose page number is `n`, wherever it sits in the strip.
- If no open page tab has number `n`, a message reports that there is no page numbered `n`.

### Reordering and grouping

A page tab is an ordinary member of the tab strip: it belongs to a group, stays contiguous within
it (see Tabs → Tab grouping), and can be reordered within its group with the reorder keys like any
other tab — it can never be dragged out of the group it was opened from.
