<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* navigating the diff tab, left arrow collapses a file, right arrow expands to the changed hunk, right arrow twice expands to the entire file. 

* use font awesome arrows-up-down icon for a button that toggles the view of a file between closed, compact, and expanded. remove the 'whole file — double-click to expand' button. remove the show lines above, below and between changes buttons and functionality. remove share more context button and functionality.

* changes like the following should show only line highlighting
- Given an array, arr, containing only of the characters 'R' (red), 'W' (white), and 'B' (blue), sort the array in place so that the same colors are adjacent, with the colors in the order red, white, and blue.
+ subtracted long text
while changes like 
- @param {number} farm
+ @param {number} test
should highlight the lines and extra highlight the change farm and test

* remove the lines over the line cap messaging.
