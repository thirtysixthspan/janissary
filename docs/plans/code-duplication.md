# Code Duplication Plan

## What changed from the prior draft (and why)

The prior draft selected the right tool (jscpd) but described its *Current State* from
guesswork, not a scan — and most of the patterns it headlined are ones jscpd structurally
cannot detect. Everything below was measured against this repo with `jscpd@5.0.11` (the
Rust version; `jscpd@4.x` is the TypeScript one).

| Prior draft | Problem | Fix in this plan |
|---|---|---|
| "Current State" centers on command-handler skeletons (×17), recognizer skeletons, `match` copy-paste | **jscpd does not detect these.** It is a Rabin-Karp **token** matcher — different command names/strings are different tokens, so renamed boilerplate is never flagged. A real scan finds **none** of them. | Replaced with the **measured** clone list (see *Current State*). |
| `mode` table: `mild` = "structural clones (same shape, different names)", `weak` = "structural clones ignoring comments" | **Wrong semantics.** The modes only control comment/whitespace token skipping (`--skip-comments` is literally an alias for `--mode weak`). jscpd finds **Type-1** (verbatim) clones only — no identifier normalization. | Corrected mode description; expectations set to Type-1 detection. |
| `--output docs/duplication/server-baseline.json` | `-o` is an **output directory**, not a filename; jscpd always writes `jscpd-report.json` into it. | Point `-o` at a directory. |
| Illustrative "3.2%, 14 clones, 45 files" + Phase 6 "controller.ts: 0% duplication (unique file), FTA 61.6" | Fabricated. Real total is **2.33%/21 clones/105 files**; controller.ts is in **4** of the 10 production clones and its real FTA score is **94.4** (per the code-quality plan). | Real numbers; controller.ts identified as the genuine hotspot. |
| Separate `.jscpd.client.json`, `duplication:client` script, client baseline | `web/src` duplication is **0.00%** — there is nothing to track. | Dropped the entire client apparatus; one config covers both. |
| `scripts/duplication-report.ts` (custom ranked report) | Redundant — jscpd ships `console-full`, `markdown`, `html`, `sarif`, and `threshold` reporters that already produce the ranked breakdown and the gate. | Dropped. Use built-in reporters + `--threshold`. |
| Committed baseline JSON + 5 npm scripts + 2 config files | Heavy machinery for 2.5% duplication concentrated in ~4 real clones. | One config, two scripts, a CI threshold gate (see *Recommended*). |

### Was there a better alternative?

**Tool: no — jscpd is the right and standard choice** (PMD-CPD is Java-oriented; jscpd is
the JS/TS norm, and v5 is the current Rust build). The better alternative is about **scope**,
not tooling. Measured duplication is only **2.48%** in production code, **0%** in the web
client, and concentrated in a handful of clones. That does not warrant a tracked subsystem
with committed baselines and a custom report script.

- **Recommended — one-time cleanup + thin gate.** Fix the ~4 meaningful clones now
  (Phase 4), add a single `--threshold` CI gate to prevent regression, and skip the
  baselines/custom script/client config. This is the leanest path that captures the value.
- **Prior draft — tracked duplication subsystem.** Two configs, baselines, a custom
  cross-referencing script. Disproportionate to a clean-ish codebase; rejected.

The genuinely useful cross-reference is real and simple: the largest clones
(`schedule.ts`/`profile.ts` ↔ `controller.ts`) sit inside `controller.ts`, which is *also*
the code-quality plan's #1 complexity target (FTA 94.4). Deduplicating them advances both
plans at once.

---

## Current State (measured 2026-06-25, `--min-lines 5 --mode mild`)

| Scope | Files | Duplication | Clones |
|---|---|---|---|
| `src/` (incl. tests) | 105 | 2.33% | 21 |
| `src/` (production, tests ignored) | 61 | **2.48%** | **10** |
| `web/src/` | 13 | **0.00%** | 0 |

Production clones, by size (the actual backlog):

| Lines | Clone |
|---|---|
| 32 | `commands/schedule.ts:22-53` ↔ `controller.ts:618-635` |
| 26 | `commands/profile.ts:14-39` ↔ `controller.ts:663-672` |
| 24 | `commands/state.ts:11-34` ↔ `state-format.ts:4-24` |
| 18 | `message-bus.ts:49-66` ↔ `messaging.ts:62-81` |
| 11 | `shell.ts:28-38` ↔ `shell.ts:40-50` (within-file) |
| 7 | `commands/close.ts:17-23` ↔ `commands/quit.ts:13-19` |
| 7 | `message-bus.ts:9-15` ↔ `types.ts:260-270` |
| 6 | `controller.ts:216-221` ↔ `controller.ts:471-476` (within-file) |
| 6 | `controller.ts:329-334` ↔ `controller.ts:847-852` (within-file) |
| 6 | `messaging.ts:21-26` ↔ `messaging.ts:37-42` (within-file) |

The remaining 11 clones (in the full scan) are test-file duplication
(`acp-loop.test.ts`, `controller.test.ts`, `index.test.ts`, `tab.test.ts`,
`profile.test.ts` ↔ `profiles.test.ts`) plus test↔source mirrors
(`logger.test.ts`↔`logger.ts`, `shell.test.ts`↔`shell.ts`). Lower priority — see Phase 4.

### How jscpd actually works (set expectations)

jscpd finds **verbatim token sequences** (Type-1 clones). `--mode` only changes which
tokens are skipped before matching:

| Mode | Behavior |
|---|---|
| `strict` | match all tokens, including comments |
| `mild` (used here) | skip empty lines |
| `weak` | also skip comment tokens (`--skip-comments` is an alias) |

It will **not** flag code that is structurally identical but uses different names — so don't
expect it to catch the command/recognizer boilerplate. That boilerplate is best handled (if
at all) by a factory helper for ergonomics, not because a duplication tool demands it.

---

## Phase 1 — Install

```bash
npm install --save-dev jscpd@5
```

Verify: `npx jscpd --version` (the binary is also exposed as `cpd`).

---

## Phase 2 — Config: single `.jscpd.json`

```json
{
  "minLines": 5,
  "minTokens": 50,
  "format": ["typescript", "tsx"],
  "mode": "mild",
  "ignore": [
    "**/*.test.ts",
    "**/*.test.tsx",
    "**/*.d.ts",
    "**/dist/**",
    "**/web/dist/**",
    "**/.janissary/**"
  ],
  "reporters": ["console-full"],
  "threshold": 3
}
```

- `ignore` excludes **test files** so the tracked metric is production duplication (2.48%),
  not test scaffolding. (jscpd also respects `.gitignore` by default, so `.janissary`/`dist`
  are skipped anyway; listing them is belt-and-suspenders.)
- `format` values `typescript` and `tsx` are both valid (verified via `jscpd --list`).
- `threshold: 3` fails the run (exit 1) when duplication exceeds 3% — just above today's
  2.48%, so it blocks **regression**. Ratchet it down toward 2% as Phase 4 clones are
  removed (mirrors the coverage/quality plans' ratchets).
- `web/src` is clean (0%); no separate client config is needed. To spot-check the client ad
  hoc: `npx jscpd web/src`.

---

## Phase 3 — npm scripts

```jsonc
{
  "scripts": {
    "duplication": "jscpd src web/src",         // uses .jscpd.json; prints clone breakdown
    "duplication:gate": "jscpd src web/src --exit-code"   // same, exits 1 if threshold exceeded (CI)
  }
}
```

No baseline snapshots, no custom report script: `console-full` prints the ranked clone list,
and `--threshold`/`--exit-code` is the gate. For a shareable artifact, add `markdown` or
`html` to `reporters` and pass `-o docs/duplication` (jscpd writes `jscpd-report.*` there).

---

## Phase 4 — Refactoring backlog (measured, ranked)

Production clones first; re-run `npm run duplication` after each.

1. **`commands/schedule.ts` ↔ `controller.ts` (32L)** and **`commands/profile.ts` ↔
   `controller.ts` (26L)** — the same logic lives in both the command module and the
   controller. Extract each into a single shared function (in the command module or a small
   helper) and have `controller.ts` call it. **Highest value:** removes 58 duplicated lines
   *and* shrinks `controller.ts`, the code-quality plan's #1 complexity target (FTA 94.4).
2. **`commands/state.ts` ↔ `state-format.ts` (24L)** — formatting logic duplicated;
   consolidate into `state-format.ts` and import it from the command.
3. **`message-bus.ts` ↔ `messaging.ts` (18L)** + `message-bus.ts` ↔ `types.ts` (7L) +
   `messaging.ts` internal (6L) — the messaging layer has repeated blocks; extract a shared
   helper and a shared type.
4. **`shell.ts:28-38` ↔ `shell.ts:40-50` (11L)** — two adjacent near-identical blocks;
   collapse into a loop or local helper.
5. **`controller.ts` internal clones (6L ×2)** — minor; fold in during the controller
   decomposition (code-quality Phase 4).
6. **`commands/close.ts` ↔ `commands/quit.ts` (7L)** — the only real command-pair overlap;
   small, optional. A `defineCommand(...)` factory would remove it *and* tidy the other
   command modules, but it's ergonomics, not a duplication emergency.

**Tests (full-scan clones):** `profile.test.ts` ↔ `profiles.test.ts` (10L) and the
test↔source mirrors (`logger`, `shell`) are worth a look — a test re-implementing source
logic can drift. The intra-test clones (`acp-loop.test.ts`, etc.) are typically fine; use
`test.each` only where it improves readability. Not gated.

---

## Outputs

| Path | Purpose |
|---|---|
| `.jscpd.json` | Single shared config (production scope) |
| terminal (`console-full`) | Ranked clone breakdown + duplication % |
| `docs/duplication/jscpd-report.*` | Optional artifact when `-o docs/duplication` + a file reporter is used (gitignore it) |

---

## Summary

| Layer | Tool | What it measures | Run command |
|---|---|---|---|
| Duplication scan | jscpd v5 | Type-1 clones, duplication %, per-clone breakdown | `npm run duplication` |
| Regression gate | jscpd `--threshold`/`--exit-code` | fails CI above 3% (ratchet toward 2%) | `npm run duplication:gate` |
| Cleanup backlog | this doc, Phase 4 | the 10 measured production clones, ranked | — |

Current state: **2.48% production duplication, 0% in the web client** — a clean-ish
codebase whose only meaningful duplication is the `controller.ts`↔command logic, which
overlaps the code-quality plan's top refactoring target.
