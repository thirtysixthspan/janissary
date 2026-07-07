# small issues

* when close is called on a tab, if it is the only tab in the tab strip, quit the application. If the file navigator is open in a sidebar, this hsould not stop the application from closing

* files should recognize ~ an $root as valid segments in paths passed as parameters

* the file navigator metadat shows dirname then full path. remove the dirname and only show the full path. paths that include $root should use the $root shortcut.

* the tab label for files should always be 'navigator'

* hide the scrollbars for the file navigator when it is in a sidebar

* the file navigator toggle button should only toggle the file navigator position between left and right sidebars

* the file navigator when in a tab will not have a position toggle button.

* clicking and holding a file in the file navigator for three seconds or typing right arrow on an already expanded directory should cause the file navigator to open that directory as the prinary directory of the navigator.

* typing right arrow on a file triggers the open action on that filetype. An image will open an image tab. a textfile will open an editor.

* the sidebar should look just like a tab strip, but only allow one tab in it for the moment, the file navigator 

* lines of text at the bottom of the file navigator should not be rendered cut off in half. only render the text if it can be seen vertically in its entirety.

* close button in the file navigator should the the right most button

