# technical-debt

## ready

## development

* Tie each remote filesystem operation to its own argument shape so mismatched requests fail at compile time.

Existing Debt: Remote filesystem operations share one all-optional argument record, so the operation name does not constrain the arguments that callers can send. Severity: 5/10

Existing Risk: 4/10 - A caller can pair a valid operation with missing or unrelated fields, which the far side rejects without a reply and leaves the request waiting until its deadline.

Proposal Risk: 2/10 - The wire decoder must still validate untrusted frames at runtime, but typed local callers cannot accidentally construct a mismatched operation and argument pair.

Proposal: In `src/remote/protocol-frames.ts`, replace the generic optional `RemoteFilesystemArguments` request payload with an operation-to-arguments mapping and a discriminated `filesystem-request` union, keeping `RemoteFilesystemOperation` as the shared operation-key union. In `src/remote/filesystem/operation-types.ts` and `src/remote/filesystem/operations.ts`, type each descriptor against the mapped arguments for its key while retaining the runtime validators and decoders that protect the wire boundary; ensure `operationDescriptor` and `decodeFilesystemResult` continue to preserve operation-specific types. Update `src/file-navigator/remote/port.ts`, `src/file-navigator/remote/port-git.ts`, `src/file-navigator/remote/port-requests.ts`, `src/remote/filesystem/refusal-shapes.ts`, and `src/remote/serve-file-navigator.ts` to accept the argument shape for their specific operation rather than the shared optional record. Keep unknown JSON parsing at `src/remote/frame/decode-filesystem.ts` dynamic, and continue decoding into the validated discriminated request only after checking the operation's required fields. `src/remote/filesystem/operations.test.ts` covers each operation's valid and invalid arguments and result shape, while `src/remote/protocol.test.ts` covers filesystem request framing and malformed inputs; update their representative request cases to use operation-specific argument types. Preserve the existing outside-root refusal and disconnected-request behavior, which these tests and the remote file-navigator tests exercise.

## deferred


## declined
