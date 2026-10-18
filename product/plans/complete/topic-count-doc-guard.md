# Topic count doc guard
**Complexity: 2/10** — one test file gains one assertion block that reads two more docs. No production code and no doc wording changes.

## Goal

Make a drift in the notification topic count fail a test. The count is hand-kept in three docs: the developer doc, the tab-plugin spec, and the plugin guideline. The developer doc test pins only the capability count, so adding a topic and leaving the prose behind passes every check.

## Verified state

- `src/plugins/api-topics.ts` declares six topics. `TAB_PLUGIN_NOTIFICATION_TOPICS` is `Object.keys` of a `Record<TabPluginNotificationTopic, true>`, so the union and the exported list stay in step at compile time. The list is the source of the count.
- `documentation/developer-documentation/tab-plugins.md` says "v2 defines six topics:".
- `product/specs/tab-plugins.md` says "This version defines six kinds of host state:".
- `ai/guidelines/plugins-tabs.md` says "v2 defines six topics".
- All three docs already read six, and each sentence contains a fixed phrase the test can match exactly. No sentence needs rewording.
- `src/plugins/documentation.test.ts` reads only the developer doc, and pins the capability count with `The host supplies <count word> capabilities:` through the `COUNT_WORDS` table.

## Approach

Reuse the capability-count pattern. The expected count word is `COUNT_WORDS[TAB_PLUGIN_NOTIFICATION_TOPICS.length]`, imported from `./api-topics.js` the way the test imports the capability names from `./api.js`. The new assertion checks each of the three docs for its own sentence form.

The sentence forms differ, so one shared pattern would need to accept loose wording. Per-doc phrases pin the exact sentence each doc carries, the same way the capability guard pins its sentence.

The order check in the entry's Proposal is left out. The entry's risk is the count, and an order rule would be a stricter rule the summary does not ask for.

## Implementation steps

1. In `src/plugins/documentation.test.ts`, import `TAB_PLUGIN_NOTIFICATION_TOPICS` from `./api-topics.js`.
2. Beside the existing `documentation` constant, read `../../product/specs/tab-plugins.md` into `specification` and `../../ai/guidelines/plugins-tabs.md` into `guideline`, using the same `readFileSync(new URL(..., import.meta.url), 'utf8')` form.
3. Add one `it` block directly after the capability-count `it`. It computes the count word from the topic list length, then asserts that the developer doc contains `v2 defines <word> topics`, the spec contains `This version defines <word> kinds of host state`, and the guideline contains `v2 defines <word> topics`.
4. Add one short comment above the new block saying that the topic count is hand-kept in three docs and that no other test reads the spec or the guideline.

## Tests

- One new `it` block with three assertions, one per doc, in `src/plugins/documentation.test.ts`.
- Each assertion fails when the count is wrong. The expected word comes from the length of the code's list. A seventh topic makes the expected word `seven`, which no doc contains, so all three fail. A doc still reading `five` or `four` does not contain `six`, so it fails. Removing a topic moves the expected word down the same way.
- Each assertion passes when the count is right. At six topics every doc contains its six-word sentence.
- No existing assertion changes.

## Out of scope

- Any production code, including `src/plugins/api-topics.ts`.
- Asserting the order of topic names in the docs.
- Any doc wording change, since all three docs already state the right count in a matchable form.
- Spec, help, and user documentation.
