# bugs

## ready

* in a narrow tree the detail value keeps its column and the filename is what gets cut. the spec says "The filename always takes precedence over the value: when a row cannot fit both — a long name, a squeezed sidebar — the name keeps its full width and the value gives way, shrinking and then disappearing behind it rather than truncating the name." reproduction: dock a tree into the left sidebar with `files left <path>` (the sidebar is 300px wide by default), then click the header's detail button once to reach size mode. expected: a row whose name does not fit keeps its name readable and loses the `2b` value. observed: in a 296px row, `a-fairly-long-but-plausible-file-name-here.txt` is given a 270px name box against 364px of natural width and rendered with `text-overflow: ellipsis`, so a quarter of the name is gone, while the `2b` value stays fully drawn at the row's right edge; an 81-character name in the same tree behaves the same way (270px box, 610px of text). a 22-character name in the same sidebar shows both, so this only appears once a row cannot fit both, which is the case the spec names. the cause is the width cap on the name at `web/src/theme.css:899`, `.files-name { flex: 0 0 auto; max-width: 100%; overflow: hidden; text-overflow: ellipsis; }`. capping the name at the row's own width is what truncates it, and once the name has shortened itself there is nothing left for `.files-detail` to give way, even though that is the shrinkable rule (`flex: 0 1 auto; min-width: 0`, `web/src/theme.css:903-906`). the comments above both rules describe the promised behaviour instead: the filename owns the row, and the value yields until it disappears entirely. likely fix: drop `max-width: 100%` and the ellipsis from `.files-name` and let `.files-row { overflow: hidden }` do the clipping, so `flex: 0 1 auto; min-width: 0` on `.files-detail` is what collapses when the two cannot both fit. the mode is untouched either way, so widening the tree or moving to a shorter row brings the value straight back.

## development

## deferred

* when closing harness tabs, the tab disappears, but the UI is not responsive for many seconds afterwards. the UI should retain responsible when closing harness tabs. Any teardown should be completed in the background, asynchronously. This may only apply to local tabs. more research needed.

*  saw this error: Already monitoring with persona "assistant" monitoring using the same assistant may happen multiple time but for different targets. in this case a new monitoring window should be opened

## declined
