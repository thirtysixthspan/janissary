# Dual licensing for Janissary — draft plan

## Status

Draft. Model decided: **PolyForm Noncommercial dual license** — PolyForm Noncommercial 1.0.0 on the same code, with a separate commercial license required for any commercial use (no published tiers/pricing). Ready to move to `plans/ready/` once the implementation steps below are reviewed.

## Where the project stands today

- `package.json` declares `"license": "UNLICENSED"` — no LICENSE file exists in the repo at all.
- The project is distributed publicly on npm (`npx janus`, `npm install -g janissary`) and the README links a public docs site, so it already behaves like an open-source project without having a license that says so.
- **No public code contributions will be accepted.** The repo is not open to outside PRs, so there is no CLA or CONTRIBUTING.md need — copyright stays entirely with the project owner, which simplifies the dual-licensing setup considerably (see below).

## Chosen model: PolyForm Noncommercial dual license

Same pattern as [EPPlus](https://www.epplussoftware.com/en/Home/LgplToPolyform) (.NET spreadsheet library) — one codebase, two ways to be licensed to use it:

1. **PolyForm Noncommercial 1.0.0**, free, for any noncommercial purpose (personal use, research, education, hobby projects, nonprofits, government agencies).
2. **A commercial license**, required instead of PolyForm Noncommercial for any commercial use — including using Janissary internally for a company's own software development, not just embedding it in a product or reselling it.

This is a materially different restriction than a copyleft license like AGPL-3.0: AGPL permits commercial use freely (its obligations only trigger on distributing a modified version, or running a modified version as a network service), whereas PolyForm Noncommercial draws a flat line at "commercial purpose" itself — any commercial use requires the paid license, full stop. This is the deliberate choice here: the project wants payment for commercial use, not just for avoiding copyleft obligations. BSL/Elastic-style licenses were considered and rejected because they restrict *production/competing-service* use, not general commercial use — a company using Janissary internally for its own development work would remain unrestricted under BSL, which doesn't match the intent.

There are **no published commercial tiers, feature gates, or pricing**. The commercial license is a single unlisted offering: "contact us" only, negotiated case by case. This avoids committing to a pricing page or a Pro/Enterprise feature split before there's demand to justify one — the option to formalize tiers later stays open.

**Repo mechanics:**
- `LICENSE` at the root carries the PolyForm Noncommercial 1.0.0 text and governs the free/noncommercial tier.
- `LICENSE-COMMERCIAL.md` carries the commercial-license statement and contact point.
- `package.json`'s `"license"` field updates from `UNLICENSED` to the SPDX identifier `PolyForm-Noncommercial-1.0.0`.

**Why no CLA is needed here:** dual licensing normally requires a CLA because relicensing a contribution commercially requires holding rights to it, and outside PRs create mixed copyright ownership. Since Janissary accepts no public code contributions, the project owner holds 100% of the copyright already — there's nothing to collect consent for. This removes the single biggest piece of process overhead (CLA bot, CLA text, CONTRIBUTING.md, retroactive contributor sign-off) that dual-licensed projects normally have to build. If that policy ever changes and outside PRs are accepted, a CLA (or a "PRs not accepted, forks welcome under the license" stance) would need to be reinstated at that time.

## Draft implementation steps

1. **Add `LICENSE`** at repo root with the full, unmodified PolyForm Noncommercial 1.0.0 text (fetch verbatim from [polyformproject.org](https://polyformproject.org/licenses/noncommercial/1.0.0); do not alter the license text itself — only a copyright notice at the top identifies the project/owner, per the license's own placeholder convention).
2. **Add `LICENSE-COMMERCIAL.md`** at repo root: a short statement that a commercial license is required for any commercial use (including internal software development) as an alternative to PolyForm Noncommercial, with no published terms/pricing — just a contact point to request one: [github.com/thirtysixthspan](https://github.com/thirtysixthspan). Model the tone on EPPlus's License FAQ, minus the tiers.
3. **Update `package.json`**: `"license"` field from `"UNLICENSED"` to `"PolyForm-Noncommercial-1.0.0"` (this is the standard SPDX identifier; the commercial-license alternative doesn't have its own SPDX slot since it's granted directly, not chosen off a package manifest).
4. **License headers**: root `LICENSE` only — no per-file SPDX headers.
5. **Update `README.md`** with a short "License" section. It must state, plainly and in this order: (a) Janissary is free for noncommercial use under PolyForm Noncommercial 1.0.0, (b) **any commercial use — including using Janissary in a commercial setting for a company's own software development, not just embedding or reselling it — requires a commercial license**, and (c) commercial licenses are **available on request**, with a link/contact point (`LICENSE-COMMERCIAL.md` / [github.com/thirtysixthspan](https://github.com/thirtysixthspan)). No mention of the no-public-contributions stance — leave it unstated rather than calling it out explicitly.
6. **Update the docs site** (`documentation/`) — add a licensing page under `documentation/user-documentation/` (end users need to know the noncommercial/commercial terms before running or redistributing Janissary, not just contributors), per `ai/guidelines/` conventions on keeping docs in sync with policy changes. This page carries the same three-part message as the README section above, spelled out for an end user, not just linked: state explicitly that using Janissary in a commercial setting (including for internal software development) requires a commercial license, and that a commercial license is available on request via the contact point. This is the point most likely to be misunderstood — people default to assuming source-available licenses work like AGPL, where plain commercial use is unrestricted — so do not leave it implicit or bury it in a linked file; say it directly on the page itself.
7. **Confirm existing history is clean**: run `git shortlog -sne` to confirm the project owner holds all authorship in history — this is a quick sanity check, not a consent-gathering exercise, since no CLA is needed (repo accepts no public code contributions).
