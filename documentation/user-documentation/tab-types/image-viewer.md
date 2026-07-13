# Image viewer

`open <image>` shows an image in its own tab — all the common formats work: PNG, JPEG, GIF, WebP, BMP, SVG, AVIF, ICO.

```
open diagram.png
```

The tab shows a compact header with the file's name, size, and location, and the image fills the space below, fit to the tab: a landscape image spans the full width, a portrait one the full height. The tab is labeled `image` in the strip (the filename is in the header) and carries a × close button.

![An image tab: the metadata header above the image, with the zoom percentage indicator visible in the corner.](/screenshots/image-tab.png)

## Zoom and pan

| Control | Action |
|---|---|
| `PageUp` / scroll wheel up | Zoom in, 10% per step |
| `PageDown` / scroll wheel down | Zoom out, 10% per step |
| `Escape` | Reset to 100% and center |
| Arrow keys | Pan (hold to keep panning) |
| Click and drag | Pan freely |

100% is the fit-to-tab size; zoom runs from 10% to 800%. While zoomed away from 100%, the current percentage is shown on the view. There are no scrollbars — reaching the out-of-view parts of a zoomed image is what panning is for. Panning with a held arrow key is continuous, and dragging follows the mouse.

## Lifecycle

<img class="agent-float" src="/agents/malik-south-west.png" alt="" />

An image tab is a live view, not saved state: zoom and pan reset when you switch away to another image tab, and image tabs are not restored by `janus --relaunch`. Closing one — via its × button or `close` — just removes the view; the file is untouched. Only files you've explicitly opened are ever served to the viewer.

To hand an image to the OS viewer instead, use `open external <image>` — see [Opening files and pages](/user-documentation/tab-types/opening-files).
