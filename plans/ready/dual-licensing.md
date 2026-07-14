# Dual licensing for Janissary — draft plan

## Status

Draft. Model decided: **Sidekiq-style dual license** — AGPL-3.0 on the same code, with a separate commercial license available on request (no published tiers/pricing). Ready to move to `plans/ready/` once the implementation steps below are reviewed.

## Where the project stands today

- `package.json` declares `"license": "UNLICENSED"` — no LICENSE file exists in the repo at all.
- The project is distributed publicly on npm (`npx janus`, `npm install -g janissary`) and the README links a public docs site, so it already behaves like an open-source project without having a license that says so.
- **No public code contributions will be accepted.** The repo is not open to outside PRs, so there is no CLA or CONTRIBUTING.md need — copyright stays entirely with the project owner, which simplifies the dual-licensing setup considerably (see below).

## Chosen model: Sidekiq-style dual license

Same pattern as [Sidekiq](https://github.com/sidekiq/sidekiq) (Ruby background jobs) and [Metabase](https://www.metabase.com/license/) (BI tool) — one codebase, two ways to be licensed to use it:

1. **AGPL-3.0**, free, for anyone willing to comply with its copyleft terms (including the network-use clause).
2. **A commercial license**, granted instead of AGPL-3.0 to anyone who doesn't want those obligations (e.g., embedding Janissary in a closed-source product, or building a competing hosted offering without open-sourcing it).

Unlike Sidekiq/Metabase, there are **no published commercial tiers, feature gates, or pricing**. The commercial license is a single unlisted offering: "contact us" only, negotiated case by case. This avoids committing to a pricing page or a Pro/Enterprise feature split before there's demand to justify one — the option to formalize tiers later stays open.

**Repo mechanics:**
- `LICENSE` at the root carries the AGPL-3.0 text and governs the free tier.
- `LICENSE-COMMERCIAL.md` carries the commercial-license statement and contact point.
- `package.json`'s `"license"` field updates from `UNLICENSED` to the SPDX identifier `AGPL-3.0-only`.

**Why no CLA is needed here:** dual licensing normally requires a CLA because relicensing a contribution commercially requires holding rights to it, and outside PRs create mixed copyright ownership. Since Janissary accepts no public code contributions, the project owner holds 100% of the copyright already — there's nothing to collect consent for. This removes the single biggest piece of process overhead (CLA bot, CLA text, CONTRIBUTING.md, retroactive contributor sign-off) that dual-licensed projects normally have to build. If that policy ever changes and outside PRs are accepted, a CLA (or a "PRs not accepted, forks welcome under the license" stance) would need to be reinstated at that time.

## Draft implementation steps

1. **Add `LICENSE`** at repo root with the full, unmodified AGPL-3.0 text (do not alter the license text itself — only the copyright notice at the top identifies the project/owner).
2. **Add `LICENSE-COMMERCIAL.md`** at repo root: a short statement that a commercial license is available as an alternative to AGPL-3.0 for those who don't want its obligations, with no published terms/pricing — just a contact point to request one: [github.com/thirtysixthspan](https://github.com/thirtysixthspan). Model the tone on Sidekiq's `COMM-LICENSE.txt`/Commercial FAQ, minus the tiers.
3. **Update `package.json`**: `"license"` field from `"UNLICENSED"` to `"AGPL-3.0-only"` (this is the standard SPDX identifier; the commercial-license alternative doesn't have its own SPDX slot since it's granted directly, not chosen off a package manifest).
4. **License headers**: root `LICENSE` only — no per-file SPDX headers.
5. **Update `README.md`** with a short "License" section: AGPL-3.0 for community use, commercial license available on request (link to `LICENSE-COMMERCIAL.md`). No mention of the no-public-contributions stance — leave it unstated rather than calling it out explicitly.
6. **Update the docs site** (`documentation/`) — add a licensing page under `documentation/user-documentation/` (end users need to know the AGPL-3.0/commercial terms before running or redistributing Janissary, not just contributors), per `ai/guidelines/` conventions on keeping docs in sync with policy changes.
7. **Confirm existing history is clean**: run `git shortlog -sne` to confirm the project owner holds all authorship in history — this is a quick sanity check, not a consent-gathering exercise, since no CLA is needed (repo accepts no public code contributions).
