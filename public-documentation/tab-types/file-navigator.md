# File navigator

`files` opens a directory tree in its own tab:

```
files            rooted at the tab's working directory
files src        rooted at src
```

Directories sort before files, both alphabetically. Version-control clutter (`.git` and friends, `.DS_Store`) is hidden; every other dotfile shows. A directory's contents are only read when you expand it, so a huge `node_modules` costs nothing until opened. The tab is labeled `files` in the strip and placed at the *start* of its group, so the tree sits left of the tabs it opens.

If a tree is already open on the same root, `files` focuses it rather than opening a duplicate. A target that isn't a directory prints `files: <path>: not a directory`.

![A file navigator tab: a directory tree with one directory expanded and a row selected.](/screenshots/file-tree.png)

## The tree stays current

Every visible directory is watched: files that appear, disappear, or get renamed show up in the tree within about a second, even during a burst of changes like a `git checkout`. If watching stops working for a directory (permissions, exotic filesystems), the tree keeps working — collapse and re-expand to refresh by hand.

## Mouse

| Interaction | Behavior |
|---|---|
| Click a row | Select it |
| Double-click a file | Open it (same as `open`) |
| `Shift`+double-click a file | Edit it (same as `edit`), even if its normal opener is a viewer |
| Double-click a directory | Expand or collapse it |
| Double-click the `..` row | Re-root the tree one directory up |
| Header ⊟ button | Collapse everything back to the root |

Files opened from the tree land in the same [group](/getting-started/groups) as the tree tab.

## Keyboard

A focused tree captures these keys for itself (tab-switching and other `Ctrl`/`Cmd` chords still work):

| Key | Behavior |
|---|---|
| `↑` / `↓` | Move the selection |
| `→` | Expand a collapsed directory; from an expanded one, move to its first child |
| `←` | Collapse an expanded directory; otherwise jump to the parent |
| `Enter` / `Space` | Open a file, toggle a directory, or (on `..`) go up |
| `Shift+Enter` | Open the selected file in the editor |
| `Home` / `End` | First / last visible row |
| `PageUp` / `PageDown` | Move by a screenful |
| Type letters | Jump to the next row starting with what you typed |

Like other view tabs, a file navigator is a live view — closed with its × button or `close`, and not restored by `janus --relaunch`.

<img class="agent-float" src="/agents/tahir-south-west.png" alt="" />
