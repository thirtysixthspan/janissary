# Embedded web pages

`open <url>` shows a live web page inside a tab:

```
open https://slashdot.org
open page slashdot.org        bare address; https:// is assumed
```

The page fills the tab body, and the tab is labeled with its root domain — `slashdot.org`. It's a real, live page — click, scroll, type, follow links, log in; the site behaves as it would in a browser, sessions included. Clicking an `http(s)` link in an agent's rendered output opens a page tab the same way.

![A page tab showing a live web page embedded in the app.](/screenshots/page-tab.png)

Only `http` and `https` addresses can be embedded; anything else (`javascript:`, `file:`, …) is rejected as invalid. A bare address without the `page` keyword is treated as a file path — the keyword is what makes `slashdot.org` a web address.

## Viewing, not driving

<img class="agent-float" src="/agents/dogan-south-west.png" alt="" />

A page tab only displays the site. The app doesn't script or read the embedded page's contents — whatever you can do inside it, you do by hand. (Programmatic browsing is a different feature: the `browser` command.) The metadata header shows the address first and groups back, forward, reload, Split, and close at the right edge. The navigation buttons are the one exception: they move the embedded page through its own history or reload it, without reading or scripting anything inside it. Double-clicking the address in the metadata header lets you edit it directly; press Enter to load the new address into the same tab, or Escape to cancel.

Many sites send headers refusing to be embedded. When the app runs in its own managed browser window, those framing restrictions are lifted and such sites render anyway; if the app fell back to your system browser at startup, a site that refuses framing may show a blocked or blank area instead.

## Names and labels

<img class="agent-float left" src="/agents/ekrem-south-east.png" alt="" />

Each page tab carries a name — `page`, then `page-2`, `page-3`, … — always the shortest free one, so a closed page's name is reused by the next one you open. The name isn't shown in the strip; it's how `close` identifies a page tab from elsewhere. The strip label itself is just the root domain, with any `www.` dropped (`docs.example.com` labels as `example.com`). The label and the address shown in the metadata header follow you as you navigate inside the embedded page — click through to another page on the same site (or a different one) and both update to match, as long as the app is running in its own managed browser.

## Closing

Four routes, same result:

- the tab's **× button**,
- `close` while the page tab is active,
- `close <name>` from any tab — `close page-2` closes that page wherever it sits; if there's no tab with that name, that's reported,
- `Cmd+W` / `Ctrl+W`, which works even while your focus is inside the embedded page.

Opening an address a page tab is already showing focuses that tab rather than embedding the site twice. Page tabs are live views: not restored by `janus --relaunch`. To open an address in your OS browser instead, use `open external <url>` (see [Opening files and pages](/user-documentation/tab-types/opening-files)).
