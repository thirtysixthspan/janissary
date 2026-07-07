# Embedded web pages

`open <url>` shows a live web page inside a tab:

```
open https://slashdot.org
open page slashdot.org        bare address; https:// is assumed
```

The page fills the tab body, and the tab is labeled with its page number and domain — `1) slashdot.org`. It's a real, live page — click, scroll, type, follow links, log in; the site behaves as it would in a browser, sessions included. Clicking an `http(s)` link in an agent's rendered output opens a page tab the same way.

![A page tab showing a live web page embedded in the app.](/screenshots/page-tab.png)

Only `http` and `https` addresses can be embedded; anything else (`javascript:`, `file:`, …) is rejected as invalid. A bare address without the `page` keyword is treated as a file path — the keyword is what makes `slashdot.org` a web address.

## Viewing, not driving

<img class="agent-float" src="/agents/tahir-south-west.png" alt="" />

A page tab only displays the site. The app doesn't script, read, or control the embedded page — whatever you can do inside it, you do by hand. (Programmatic browsing is a different feature: the `browser` command.)

Many sites send headers refusing to be embedded. When the app runs in its own managed browser window, those framing restrictions are lifted and such sites render anyway; if the app fell back to your system browser at startup, a site that refuses framing may show a blocked or blank area instead.

## Page numbers and labels

Each page tab is numbered `1`, `2`, `3`, … — always the smallest free number, so open pages count up from 1 without gaps, and a closed page's number is reused. The strip label combines number and root domain — `1) slashdot.org` — with any `www.` dropped (`docs.example.com` labels as `example.com`).

## Closing

<img class="agent-float right" src="/agents/hakim-south-west.png" alt="" />

Four routes, same result:

- the tab's **× button**,
- `close` while the page tab is active,
- `close page <n>` from any tab — `close page 2` closes page 2 wherever it sits; if there's no page `n`, that's reported,
- `Cmd+W` / `Ctrl+W`, which works even while your focus is inside the embedded page.

Page tabs are live views: not restored by `janus --relaunch`. To open an address in your OS browser instead, use `open external <url>` (see [Opening files and pages](/tab-types/opening-files)).
