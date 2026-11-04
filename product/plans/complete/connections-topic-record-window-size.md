# Share the ACP record window size with the connections topic actions

**Complexity: 2/10** — one value import and two constant references in one server module, plus making the existing topic paging tests read the exported constant; no behavior, protocol, record-model, or UI change.

## Goal

`src/plugins/connections-topic-actions.ts` declares its own `PAGE_SIZE = 20` for the initial `load` request and each `loadOlder` increment, while `src/acp-records/model.ts` already owns the same value as `ACP_RECORD_WINDOW_SIZE`. Nothing links the two, so a future change to the record window default silently leaves the topic paging at the old size. Make the topic actions read the one exported constant so the loading and paging size follow it.

## Approach

Import `ACP_RECORD_WINDOW_SIZE` as a value from `../acp-records/model.js`, delete the local `PAGE_SIZE`, and substitute the constant in both places it is used:

- `load` stores the initial requested count as `ACP_RECORD_WINDOW_SIZE`.
- `loadOlder` keeps the existing `Math.max(PAGE_SIZE, Math.min(window.totalBlocks, count + PAGE_SIZE))` clamp, with both size terms replaced by the constant. Keeping the clamp preserves the current zero-total and `hasOlder` behavior: `loadOlder` still consults the window first, returns when `hasOlder` is false, and never asks for less than one window.

Nothing else in the action dispatch changes: the action list and ordering, the live and core-record owner validation, and the `durableRows` window projection stay as they are. The record model, `recordWindow`, and the protocol types are untouched.

The topic test currently hardcodes the record total as 45 and asserts counts of 20 and 40. Because the point of the change is that a record-window change is followed by the topic, the test should stop restating the number: derive the fixture total from `ACP_RECORD_WINDOW_SIZE` (two windows plus five blocks) and assert the loaded count and the one-page growth against the constant. That keeps the existing offset and `hasOlder` coverage for the 20-block case while making it track the exported value.

## Implementation steps

1. In `src/plugins/connections-topic-actions.ts`, add the value import of `ACP_RECORD_WINDOW_SIZE` from `../acp-records/model.js`, remove `const PAGE_SIZE = 20;`, and use the constant for `load`'s stored count and both size terms of `loadOlder`'s clamp.
2. In `src/plugins/connections-topic.test.ts`, import `ACP_RECORD_WINDOW_SIZE`, compute the fixture's total blocks and default mock count from it, and update the paging assertions in the load/reset case, the empty-window case, and the tab-close/reopen case to use the constant and the derived total.
3. Run `$janissary/scripts/run.mjs check-diff` after each step.

## Tests

Extend `src/plugins/connections-topic.test.ts`:

- A loaded window's `count` equals `ACP_RECORD_WINDOW_SIZE`, with `offset` and `hasOlder` derived from the fixture's constant-based total.
- One `loadOlder` grows the window's `count` by exactly `ACP_RECORD_WINDOW_SIZE` (to twice the constant), with the offset and `hasOlder` still correct.
- A fresh `load` after paging resets the count to the constant.
- The empty-record `loadOlder` refuses and keeps asking for exactly the constant.
- Closing and reopening a record tab still releases and reloads the newest window and pages once by the constant.
- Every other existing connections topic case continues to pass unchanged.

## Spec

No functional spec change: the visible behavior is unchanged. `product/specs/acp-records.md` already states the window's default size is 20 and that paging increments follow it, and `product/specs/connections-tab.md` already describes the newest-history window and older-block paging. Sharing the constant restates that same behavior in code.

## Docs

None: no command, flag, default, or user-visible behavior changes, and no existing help page or user-documentation page names the local constant.

## Out of scope

- Changing `src/acp-records/model.ts`, `recordWindow`, or the value `ACP_RECORD_WINDOW_SIZE`.
- Changing the protocol types, the window projection, or the connections topic payload.
- Changing action ordering, owner validation, the `hasOlder` guard, or any user-facing paging behavior.

## Completion

- Imported `ACP_RECORD_WINDOW_SIZE` from `../acp-records/model.js`, deleted the local `PAGE_SIZE`, and used the constant for `load`'s stored count and both terms of `loadOlder`'s clamp.
- Derived the topic test fixture's total blocks and default window count from the constant, and changed the paging assertions to check that a loaded window's count equals `ACP_RECORD_WINDOW_SIZE` and one `loadOlder` adds exactly that constant; the reset, empty-window, and reopen cases now use the same constant.
- The focused server suite passes 9 of 9 in `src/plugins/connections-topic.test.ts`.
- `$janissary/scripts/run.mjs check-diff` passed lint, typecheck, and the server tests.
- No spec or user-documentation change: the connected-record paging behavior is unchanged, and the existing specs already state the window default and its paging increments.
- Removed only the resolved entry from `product/backlog/pull-request.md`.

