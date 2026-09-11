# Surface PDF page rendering failures

Complexity: 4/10.

## Goal

A genuine stage-page or text-layer failure replaces the document with the existing failed presentation and reports one failure intent per tab.

## Approach and implementation

1. Share the hook's one-time failure reporter with stage rendering. Propagate page failures through the stage while ignoring cancelled, superseded, unmounted, and thumbnail-only work. Remove the obsolete silent-error comment. Add adapter, hook, and tab regressions; run check-diff.
2. Clarify the PDF failure spec, complete this plan, and remove the backlog entry. The current public documentation and PR description already promise this behavior and need no edit.

## Tests

Cover canvas and text-layer rejection propagation; PDF.js render cancellation classification; failed body with retained metadata; one intent across simultaneous failures; no report from cancellation, superseded renders, closed tabs, or thumbnails.

Use the established explanatory lint suppression on deferred Promise fixtures because the web type target excludes ES2024.

## Out of scope

Navigation, asset serving, dependency policy, and document loading behavior.
