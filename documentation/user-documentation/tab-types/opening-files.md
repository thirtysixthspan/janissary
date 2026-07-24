# Opening files and pages

<img class="agent-float" src="/agents/aslan-south-east.png" alt="" />

The `open` command views a file or web page in a new tab:

```
open diagram.png              image, in an image tab
open notes.md                 Markdown, rendered in a markdown tab
open https://example.com      web page, embedded in a page tab
open page example.com         same, for a bare address
```

Full form: `open [external] [page] <target>`. Relative paths resolve against the tab's working directory. What kind of tab you get depends on the file type — see [Image viewer](/user-documentation/tab-types/image-viewer), [Markdown preview](/user-documentation/tab-types/markdown-preview), and [Embedded web pages](/user-documentation/tab-types/web-pages). Every tab it opens joins the current tab's [group](/user-documentation/getting-started/groups) and can be closed from the strip with its × button.

Targets with an `http://` or `https://` scheme are treated as web addresses; the `page` keyword forces web interpretation and assumes `https://` for a bare address like `example.com`. Anything else is a file path. Only `http` and `https` pages can be opened — other schemes are rejected as invalid.

## Opening outside the app: `open external`

`open external <target>` hands the target to the operating system instead of opening a tab:

```
open external photo.jpg           the OS image viewer (Preview on macOS)
open external https://example.com the OS default browser
```

## Wildcards

<img class="agent-float left" src="/agents/bilal-south-west.png" alt="" />

A path with shell wildcard characters opens every matching file, up to 10 at a time:

```
open shots/*.png
```

The pattern expands exactly as your shell would expand it. Past 10 matches, the first 10 open and a note reports how many matched in total. A pattern matching nothing reports that too. Wildcards only apply to file paths, never web addresses.

## Errors

Mistakes are reported in the current tab before anything opens:

- A malformed invocation prints the usage line: `open [external] [page] <target>`.
- A file that doesn't exist gets a not-found message.
- A file type with no viewer is reported as unsupported.
- A malformed or non-`http(s)` address is reported as invalid.
