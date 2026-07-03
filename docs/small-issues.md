# small issues

* Output lines containing patterns like src/foo.ts:42 or tests/test.py:10:5 are now rendered with clickable links. Clicking opens the file in an editor tab (same as typing open <filepath>). However this should instead be edit <filepath> to open an editor tab, not a view tab.

* a command like `edit foo.md` should go in the transcript before an editor tab is openned.

* the editor tab has no blinking cursor to indicate the current position of edit in the editor window.

* clicking in the editor tab, but outside of a current line or on the metadata line should not steal the focus from the edit cursor position.

* urls for example https://www.google.com should be clickable and open the url in a web tab, not a native chrome tab.

* use filenames on image and markdown preview tab as tab labels just like in editor tabs.









