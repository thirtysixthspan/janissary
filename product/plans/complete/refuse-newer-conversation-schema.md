# Preserve conversations written by a newer schema version

**Complexity: 4/10** — ~35 added lines across 2 production files, 6 behavioral requirements and 7 test scenarios (p=5.007); a localized decode-and-refuse change with no new architecture.

The conversation store treats an exact schema-version match as the only readable document, so a record written by a newer build decodes as absent. `ConversationsManager.create` then treats that id as free and a later save writes a fresh conversation over the file, destroying its turns. The schedule store already distinguishes an `unsupported-version` document from a malformed one; the conversation store should do the same.

## Goal

A conversation record whose `schemaVersion` is greater than the version this build understands is never read into memory, listed, opened, or overwritten. It stays byte-for-byte on disk and is reported distinctly from a malformed or missing record, so downgrading to an older build can no longer silently erase a newer conversation. Version 1 behavior is unchanged.

## Approach

- Introduce a decode result that separates a readable conversation from a recognized-but-newer version and from an invalid/absent document. A record is "newer" when `schemaVersion` is a safe integer greater than `CONVERSATION_SCHEMA_VERSION`; the rest of its shape need not be understood.
- Route file reads through this decode. `read` keeps returning `Conversation | undefined` for backward compatibility, while a new predicate exposes the newer-version outcome to callers that must refuse to act.
- `scan` reports a newer-version directory with its own warning instead of the "missing or malformed" one, and still adds no summary for it.
- `create` refuses an id whose on-disk record is a newer version, and `write` refuses to overwrite one as a backstop for every write path (first query, model change, rename, workspace hand-off).

## Implementation steps

1. In `src/conversations/store.ts`, add the decode result type and guard, a private file decoder, a `hasNewerRecord(id)` predicate, a write refusal, and a distinct scan warning; refactor `read` to use the decoder. Run `check-diff`.
2. In `src/conversations/manager.ts`, extend `create` to refuse an id with a newer-version record. Run `check-diff`.
3. Add cases to `src/conversations/store.test.ts` and `src/conversations/manager.test.ts`. Run `check-diff`; all checks must pass.
4. Update `product/specs/conversations.md`, promote the plan, remove the resolved backlog entry, and ship.

## Tests

- `src/conversations/store.test.ts`: a v2 document is not read and not listed; `hasNewerRecord` is true for it and false for a v1/absent record; `scan` emits a distinct newer-version warning rather than the malformed one; `write` refuses to replace a v2 document and leaves its bytes intact.
- `src/conversations/manager.test.ts`: `create` returns false for an id whose on-disk record is a newer version and leaves the file unchanged.
- Keep the existing version-1 round-trip, malformed/missing warning, and failed-write cases passing unchanged.

## Spec

`product/specs/conversations.md`: add a short paragraph under "Storage and workspace" stating that a record written by a newer schema version is left untouched, is not read or listed, is reported distinctly from a malformed record, and cannot be created over or overwritten.

## Out of scope

A migration path for newer-version records, parsing or displaying their contents, changing the schema version constant, changing version-1 validation, help or public user documentation additions, and any change outside the conversations feature. No new comments.
