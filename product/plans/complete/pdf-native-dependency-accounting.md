# Account for PDF.js native optional dependencies

Complexity: 2/10.

## Goal

The dependency record distinguishes one direct PDF dependency from its optional native transitive packages and records the gate results for the whole graph.

## Decision

Keep and account for the existing dependency graph, the second outcome explicitly allowed by the review. Removing lock entries alone is not a durable exclusion: pdfjs-dist still declares the optional dependency and installation can restore it. Avoid changing the project's installation policy for unrelated optional native tooling or maintaining a replacement PDF.js package. Keeping canvas accepts its installation surface, even though the browser viewer never uses its Node rendering path.

The lock contains pdfjs-dist 6.3.289, @napi-rs/canvas 1.0.9, and eleven platform-specific canvas packages at 1.0.9. npm selects compatible native binaries for the installing platform; it does not install all eleven on every machine.

## Approach and implementation

1. Record direct and transitive dependencies and exact audit results in the completed plugin plan, and clarify browser-owned rendering in the PDF spec. Regenerate the lock with unchanged declarations, validate a clean npm install and build, and run check-diff.
2. Complete this plan and remove the backlog entry. After pushing, correct only the PR description's dependency-cost and dependency-gate paragraphs, preserving the rest of the body and the title.

## Tests and verification

The canvas wrapper and all eleven native packages pass check-malicious-package at 1.0.9 (exit 0). The complete lock audit reports AUDIT CLEAN (exit 0), with 17 existing compromised-account advisories for unrelated packages at versions not known malicious. This is a blocklist result, not proof of binary safety.

Regenerate package-lock without changing package declarations and confirm no graph drift. Run npm ci with lifecycle scripts suppressed, rebuild the required existing native tools, run the application build and PDF tests, then repeat the lock audit. CI uses npm ci on Node 24, which satisfies PDF.js's declared engine requirement; the workflow needs no edit. No GitHub checks are currently reported for this branch, and the local runtime is Node 26.6.0.

## Out of scope

General dependency upgrades, unrelated advisory remediation, global optional-dependency exclusion, and native server PDF rendering.

## Results

Lock regeneration produced no diff. A clean npm ci with scripts suppressed and the required rebuilds succeeded. The full application build and all 43 PDF client tests passed. The repeated blocklist audit returned exit 0. npm's separate vulnerability audit reports 16 existing findings (8 moderate, 8 high); this work does not characterize the full dependency tree as vulnerability-free.
