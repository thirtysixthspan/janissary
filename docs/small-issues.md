# small issues


* When transcript output contains a file:line pattern (e.g. src/foo.ts:42), clicking it opens the file in an editor tab. Turns compiler and linter output into navigable source links with no extra commands.

* acp Conversation reset - acp reset kills the current tab's ACP subprocess and starts fresh on the next prompt, clearing the accumulated context window. Useful when a long session has drifted or the model is confused by prior turns. The ACP connection already reconnects lazily on the next prompt; reset just makes the disconnect explicit and user-triggered.



