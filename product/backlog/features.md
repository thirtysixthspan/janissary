# features

## ready

* The glob tool locates files by matching their paths against a glob pattern, returning the set of matching file paths without reading any file contents. It accepts a pattern argument written in glob syntax (for example **/*.ts for recursive TypeScript files, src/**/*.test.ts for tests under a src directory, or packages/core/*.{ts,tsx} for brace-expanded extensions), along with an optional path argument that scopes the search to a specific directory (defaulting to the current working directory when omitted), an optional hidden boolean that controls whether dotfiles and hidden directories are included (typically excluded by default), and an optional limit integer that caps the number of returned results (with a sensible default such as 100). The tool searches the filesystem using ** to match zero or more directory segments, * to match within a single path segment, ? to match a single character, and {a,b} alternation for multiple suffixes; it must respect the requested limit by truncating results once the threshold is reached, and it should terminate within a bounded search timeout (commonly around 30 seconds) rather than walking indefinitely across very deep or broad trees. The return value is an ordered list of matching relative or absolute file paths (typically newline- or list-delimited), and when nothing matches it returns an empty result rather than an error, while a missing or invalid path should produce a clear error indicating the directory does not exist. The tool should never follow symlinks into cycles, should skip paths that are excluded by standard ignore rules (such as .git, node_modules, and other VCS-ignored directories) unless explicitly configured otherwise, and should prioritize fast, shallow directory scanning so it can be used repeatedly and cheaply by an agent to discover filenames before reading or editing them. For permission tracking, the tool reports the requested pattern (rather than the search path) as its resource identifier so that authorization rules can grant or deny access based on what is being searched for, and it is intentionally distinct from a grep-style tool: glob matches only file paths by name, never file contents, leaving content search to a separate tool. A robust reimplementation should therefore expose pattern (required), path, hidden, and limit as parameters, return sorted/stable path results, enforce the limit and timeout, honor ignore rules and symlink safety, and document the exact glob semantics (specifically the meaning of ** and whether matching is case-sensitive) so an AI can predictably discover, select, and act on files in a large repository.


## development


* add an ACP skill to allow an agent to spin up other agents with different models, pass them ai tasks (form the repository) to execute and access to monitor the transcript as the agent works, and to recieve the response.



## deferred

* Bundle janissary as a mac application that can be dowloaded and installed into /Applications and launched from an icon in the toolbar.

* Durable flows across relaunch - capture exit information from a harness and be able to use it to restart a session. a relaunch harness picker. workspace dir would need saved and re-created.

## declined

