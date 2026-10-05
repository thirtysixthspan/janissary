# Start the toast stack below the visible tab's metadata row

**Complexity: 2/10** — The toast stack is fixed to the window's upper-right corner and measures where to begin from the connection indicator and the floating status panels, with a 40px floor that clears only the tab strip. The metadata row under the tab strip is not one of the things it measures, so when no status panel is showing — which is the usual state of a shell tab, whose panels hide when they have nothing to list — a toast lands on top of the metadata row and covers its cwd and its action buttons.

## Goal

A notification toast shown over a shell tab sits entirely below the tab's metadata row, and still below the connection indicator and any status panel that extends further down.

## Approach

Add the metadata row (`.tab-meta`) to the elements the toast position hook measures. The shell tab renders the same `.tab-meta` row as an agent tab, so the host keeps one generic rule rather than naming a plugin's markup, and an agent tab's metadata row is cleared the same way. A hidden tab's row measures as zero height, so only the rows actually on screen push the stack down.

## Implementation

1. In `web/src/toasts/useToastPosition.ts`, include `.tab-meta` in the measured obstacles.
2. Update the notifications spec's toast placement paragraph to name the metadata row.

## Tests

- New `web/src/toasts/useToastPosition.test.ts`: with a visible metadata row whose bottom is below the floor, the toast top is that bottom plus the gap; a status panel that extends further down still wins; a metadata row that measures zero (a hidden tab) leaves the floor in place.

## Out of scope

- Moving the toast stack to another corner or into the tab body.
- The status panels' own placement under the metadata row.
