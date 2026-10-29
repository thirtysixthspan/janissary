### open

Open files in the application or show web pages in an embedded tab. Use `open external` to hand a file to its configured or default viewer, or a web address to the system browser.

**Usage**

`open <path>`

`open <url>`

`open page <address>`

`open external <path>`

`open external <url>`

`open external page <address>`

**Use cases**

- Open one or more project files, including supported wildcards.
- View a web page inside the application, including a bare address with `page`.
- Hand a file or web address to its configured or default external viewer.

The `external` and `page` keywords work in either order. `open` only handles known file types, so a file with no extension reports `No opener for "(none)" files.`; use `edit <path>` to open it as text. If nothing can open an external file, the message names the viewer, such as `No PDF viewer available. The file is at <file>`.

**Examples**

- `open README.md` opens the project readme.
- `open $root/README.md` opens the same file by its project-root path. A path can also start with `~` for your home directory.
- `open https://example.com` opens a web page in the application.
- `open page example.com` opens the bare address in the application with `https://` assumed.
- `open external README.md` hands the file to its external viewer.
- `open external page example.com` hands the web address to the system browser.
