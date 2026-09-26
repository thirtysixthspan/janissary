# Embedded web pages

`open <url>` shows a live web page inside a tab:

```
open https://slashdot.org
open page slashdot.org        bare address; https:// is assumed
```

The page fills the tab body, and the tab is labeled with its root domain — `slashdot.org`. It's a real, live page — click, scroll, type, follow links, log in; the site behaves as it would in a browser, sessions included. Clicking an `http(s)` link in an agent's rendered output opens a page tab the same way.

The new tab lands in the same [group](/user-documentation/getting-started/groups) as the tab you ran the command from, with its own dot color, and takes focus. Nothing is written to the transcript: the tab that opens is the whole confirmation. A [profile](/user-documentation/automation/profiles) records an open page tab by its address and reopens it on launch the same way you would.

![A page tab showing a live web page embedded in the app.](/screenshots/page-tab.png)

Only `http` and `https` addresses can be embedded; anything else (`javascript:`, `file:`, …) is rejected as invalid. A bare address without the `page` keyword is treated as a file path — the keyword is what makes `slashdot.org` a web address.

## Viewing, not driving

<img class="agent-float" src="/agents/dogan-south-west.png" alt="" />

A page tab only displays the site. The app doesn't drive it: whatever you can do inside the page, you do by hand. (Programmatic browsing is a different feature: the `browser` command.) One thing does read it, and only when you ask for it: a [monitor](/user-documentation/automation/monitoring#what-a-monitor-sees) watching the tab is sent the text visible in the page, the same way it's sent an agent's transcript. The metadata header shows the address first and groups back, forward, reload, Split, and close at the right edge. Reload re-fetches the page where it stands. Back and forward reach into the page's own history, which a site on another origin won't let the app touch, so on most pages they do nothing; get back to an earlier page with the address field or the page's own links. Double-clicking the address lets you edit it in place: press `Enter` to load the new address into the same tab, or `Escape` to cancel. Clicking away from the field loads it too, so clicking outside is not a way to back out of an edit. An address Janissary can't turn into a web address at all, one carrying a `javascript:` or `file:` scheme or a malformed one, is discarded and the tab stays where it was; a well-formed address that turns out to be unreachable is loaded anyway, so a site that is down or a page that isn't there shows you the site's own error. Loading a new address this way leaves the tab's name, its place in the strip, and its group alone. Only the address changes: the label stays the root domain, and the header never shows the site's own page title.

Switch to another tab and back and the page is exactly as you left it — same scroll position, same in-page state, never reloaded.

Many sites send headers refusing to be embedded. When the app runs in its own managed browser window, those framing restrictions are lifted and such sites render anyway; if the app fell back to your system browser at startup, a site that refuses framing may show a blocked or blank area instead.

## Names and labels

<img class="agent-float left" src="/agents/ekrem-south-east.png" alt="" />

Each page tab carries a name — `page`, then `page-2`, `page-3`, … — always the shortest free one, so a closed page's name is reused by the next one you open. The name isn't shown in the strip; it's how `close` identifies a page tab from elsewhere. The strip label itself is just the root domain, with any `www.` dropped (`docs.example.com` labels as `example.com`). The × after the label closes that tab without selecting it first. A page tab is an ordinary member of its group: you can move it within the band, and the rest of the strip reads it like any other tab. The label and the address shown in the metadata header follow you as you navigate inside the embedded page — click through to another page on the same site, or a different one, and both update to match. That needs the app's bundled browser extension to be running. When the app has fallen back to your system browser, the address and label stay as they were when you opened the tab.

Opening an address a page tab is already showing focuses that tab rather than embedding the site twice, and the address it matches is the one the page is on now, not the one it opened on. Page tabs are live views: not restored by `janus --relaunch`. To open an address in your OS browser instead, use `open external <url>` (see [Opening files and pages](/user-documentation/tab-types/opening-files)).

## Closing

Five routes, same result:

- the tab's **× button** in the strip,
- the **×** beside the address in the metadata header, which you can reach without going to the strip at all,
- `close` with the page tab active. Bare `close` closes whichever tab is active, so it only reaches a page tab that is the one you're looking at,
- `close <name>` from any tab — `close page-2` closes that page wherever it sits; if there's no tab with that name, that's reported,
- `Cmd+W` / `Ctrl+W`, which works even while your focus is inside the embedded page.

Closing drops the tab from the strip and hands focus to whichever tab had it before this one, or to a neighbouring tab if that one is gone. A page tab owns no shell, session, or served file, so there is nothing else to tear down.
