# Opening files and pages

<img class="agent-float" src="/agents/selim-south-west.png" alt="" />

The `open` command views a file or web page in a new tab:

```
open diagram.png              image, in an image tab
open clip.mp4                 video, played in a video tab
open track.mp3                audio, queued in the audio tab
open notes.md                 Markdown, rendered in a markdown tab
open paper.pdf                PDF, rendered in a PDF tab
open https://example.com      web page, embedded in a page tab
open page example.com         same, for a bare address
```

Full form: `open [external] [page] <target>`. Relative paths resolve against the tab's working directory. What kind of tab you get depends on the file type — see [Image viewer](/user-documentation/tab-types/image-viewer), [Video player](/user-documentation/tab-types/video-player), [Audio player](/user-documentation/tab-types/audio-player), [Markdown preview](/user-documentation/tab-types/markdown-preview), [PDF viewer](/user-documentation/tab-types/pdf-viewer), and [Embedded web pages](/user-documentation/tab-types/web-pages). Every tab it opens joins the current tab's [group](/user-documentation/getting-started/groups) and can be closed from the strip with its × button.

Files opened from a remote [file navigator](/user-documentation/tab-types/file-navigator) use the same viewer or editor as local files. Janissary reads the remote content into its session cache first; saving an editor tab writes the change back to the remote host. If that write fails, the editor remains marked as changed and the notifications feed reports the failure.

Targets with an `http://` or `https://` scheme are treated as web addresses; the `page` keyword forces web interpretation and assumes `https://` for a bare address like `example.com`. Anything else is a file path. Only `http` and `https` pages can be opened — other schemes are rejected as invalid.

## Opening outside the app: `open external`

`open external <target>` hands the target to the operating system instead of opening a tab:

```
open external photo.jpg           the OS image viewer (Preview on macOS)
open external clip.mp4            your configured video player (QuickTime Player by default)
open external paper.pdf           your configured PDF application (the OS default otherwise)
open external papers.zip          whichever application your OS opens archives with
open external https://example.com the OS default browser
```

This works for any file, including types Janissary has no viewer of its own for. Your operating system already knows what opens a `.zip`, so `open external` hands the file over and confirms with `Opening papers.zip in your default viewer…`. If nothing can be launched, you get the file's path instead.

A few formats can only be opened this way — `open clip.mkv` and `open track.wma` go straight to an external player with no tab. Which application gets a video or an audio file is yours to set; see [Video player](/user-documentation/tab-types/video-player) and [Audio player](/user-documentation/tab-types/audio-player).

`open external` is refused for a remote file. An external application could change only the local cached copy, with no way to write that change back to the remote host.

## Opening a file to change it: `edit`

`edit <target>` opens a file for editing rather than viewing, and picks the editor by file type:

```
edit src/index.ts                 the plain-text editor
edit Makefile                     the plain-text editor, extension or not
edit diagram.png                  the image editor
edit notes.md:42                  the plain-text editor, cursor on line 42
```

Images are the one file type with an editor of their own — everything else, including Markdown, opens as text. That does mean `edit diagram.png` can't show you a PNG's raw bytes; there's no way to ask for that. A `:<line>` suffix is accepted anywhere and ignored where it makes no sense.

## Create a file or directory

```
newfile meeting notes.md
newdir draft notes
```

`newfile <file>` opens an empty, unsaved plain-text editor for the requested name. It always creates a text buffer, even for an image extension such as `.png`. The file is written only when you use **Save**.

`newdir <directory>` creates the directory immediately. Its parent directory must already exist; the command doesn't create missing ancestors.

Relative paths use the issuing tab's working directory. The remaining text is one path, including spaces, so type `newfile meeting notes.md` without quotes. Leading and trailing spaces are trimmed. These commands don't expand wildcards; `*` is a literal part of the requested name.

If the name already exists, a numeric suffix selects the next free name, such as `meeting notes-2.md`. For the navigator buttons, naming, and first-save collision handling, see [Creating files and directories](/user-documentation/tab-types/file-navigator#creating-files-and-directories).

Bare `newfile` reports `Usage: newfile <file>`. Bare `newdir` reports `Usage: newdir <directory>`.

## Wildcards

<img class="agent-float left" src="/agents/ahmed-south-east.png" alt="" />

A path with wildcard characters opens every matching file, up to 10 at a time:

```
open shots/*.png
```

Janissary expands the pattern itself rather than handing it to a shell, so it matches the same files whatever shell you use. You get `*`, `?`, character classes like `[abc]`, and brace expansion like `*.{png,jpg}`. The pattern is only ever matched against filenames, never run — one containing shell punctuation matches nothing.

Past 10 matches, the first 10 open and a note reports how many matched in total. A pattern matching nothing reports that too, as does one that matches only directories. Wildcards only apply to file paths, never web addresses.

## Errors

<img class="agent-float" src="/agents/mahir-south-east.png" alt="" />

Mistakes are reported in the current tab before anything opens:

- A malformed invocation prints the usage line: `open [external] [page] <target>`.
- A file that doesn't exist gets a not-found message.
- A malformed or non-`http(s)` address is reported as invalid.

A file type with no viewer is the one exception. Opening it in the app reports `No opener for ".xyz" files.` in the [notifications feed](/user-documentation/tab-types/notifications) rather than in the current tab, because the same message comes from double-clicking a row in the [file navigator](/user-documentation/tab-types/file-navigator), which has no transcript to print it in. If the feed isn't open, it opens itself in the right sidebar to show you. To open the file anyway, use `open external <file>` and let your operating system handle it.
