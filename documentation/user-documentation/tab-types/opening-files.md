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

This works for any file, including types Janissary has no viewer of its own for. Your operating system already knows what opens a `.zip`, so `open external` hands the file over and confirms with `Opening papers.zip in your default viewer…`. A video, an audio file, and a PDF each name their own reader: `Opening clip.mp4 in your default video player…`, `Opening track.mp3 in your default audio player…`, `Opening paper.pdf in your default PDF viewer…`. When you've named an application in `externalViewers`, the confirmation names that one instead: `Opening clip.mp4 in QuickTime Player…`. If nothing can be launched at all, you get the path rather than an application: `No video player available. The file is at <file>`.

A few formats can only be opened this way — `open clip.mkv` and `open track.wma` go straight to an external player with no tab. Which application gets a video or an audio file is yours to set; see [Video player](/user-documentation/tab-types/video-player) and [Audio player](/user-documentation/tab-types/audio-player).

`open external` is refused for a remote file, because an external application could change only the local cached copy with no way to write that change back to the remote host. That refusal goes to the [notifications](/user-documentation/tab-types/notifications) feed rather than the tab you typed it in, since a file navigator has no transcript of its own: `Remote files cannot be opened externally. Edit or open the file in a tab instead.`

## Opening a file to change it: `edit`

`edit <target>` opens a file for editing rather than viewing, and picks the editor by file type:

```
edit src/index.ts                 the plain-text editor
edit Makefile                     the plain-text editor, extension or not
edit diagram.png                  the image editor
edit paper.pdf                    the PDF viewer
edit notes.md:42                  the plain-text editor, cursor on line 42
```

Images and PDFs are the file types with an editor of their own. Everything else, including Markdown, opens as text. That does mean `edit diagram.png` can't show you a PNG's raw bytes, and `edit paper.pdf` opens the [PDF viewer](/user-documentation/tab-types/pdf-viewer) rather than the document's text. There's no way to ask for either as text. A `:<line>` suffix is a `edit` feature: it is ignored by the other openers where it makes no sense, and `open` rejects it outright, as [Errors](#errors) below describes.

The editor holds the whole file in memory, so `edit` refuses anything over 2 MB and opens no tab at all:

```
edit: data.json is 4.7M — too large to edit in-app (limit 2.0 MB).
```

The line names the file, its actual size, and the limit, so you can tell which of the two it is. A file that big wants a real editor, or a viewer if you only meant to look at it.

Asking for a file you already have open in an editor tab doesn't open a second one: `edit` focuses the tab you already have, the same way the [image](/user-documentation/tab-types/image-viewer), [PDF](/user-documentation/tab-types/pdf-viewer), [video](/user-documentation/tab-types/video-player) and [markdown](/user-documentation/tab-types/markdown-preview) views do. With a `:<line>` suffix on a file that is already open, that tab's cursor moves to the line instead of a new tab opening.

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
- A file that doesn't exist is named as missing: `open: notes.md: no such file`.
- A pattern that matches nothing is named too: `open: docs/*.rst: no matching files`.
- A wildcard matching more than ten files opens the first ten and says so: `Opening the first 10 of 24 matching files.`
- A malformed or non-`http(s)` address is reported as invalid: `open: invalid URL "htp:/example.com"`, or `unsupported scheme in "javascript:alert(1)"` for a scheme that isn't `http` or `https`.
- A web address with no `page` keyword is taken as a file path, and a path that looks like one is refused: `open: no viewer for web addresses`. Spell it `open page example.com` to embed a site.
- A `:<line>` suffix is refused, because `open` looks for an opener by extension and finds none for `notes.md:42`: `No opener for ".md:42" files.` Drop the suffix and it opens, or use `edit notes.md:42` to land on the line.

The `video`, `audio`, and `pdf` commands have their own two. Given no argument, each prints its usage: `Usage: video <path>`, `Usage: audio <path>`, `Usage: pdf <path>`. Given a file that isn't its kind, each refuses it by name: `video: notes.txt: not a video file`, and the same shape for `audio` and `pdf`, including `pdf external notes.txt`.

A file type with no viewer is the one exception. Opening it in the app reports `No opener for ".xyz" files.` in the [notifications feed](/user-documentation/tab-types/notifications) rather than in the current tab, because the same message comes from double-clicking a row in the [file navigator](/user-documentation/tab-types/file-navigator), which has no transcript to print it in. It lands in the queue and toasts if the feed isn't on screen, the same as any other notification. To open the file anyway, use `open external <file>` and let your operating system handle it.
