<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Remove technical debt by testing the new disabled and hidden model lookup behavior.

Existing Issue: The compatibility API now removes disabled records while leaving hidden records launchable, but catalog tests only verify flags during decoding and serialization and never assert either lookup result. Severity: 4/10

Existing Risk: 4/10 - A later filter change could silently let a disabled model through the launch guard or make hidden models disappear from model completion and validation.

Proposal Risk: 1/10 - Direct assertions against the compatibility lookups would catch regressions to either flag rule before they affect launch validation or model completion.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1935 "test disabled and hidden model lookup behavior". Add focused cases in src/models/catalog-file.test.ts that write an override containing one disabled record and one hidden record, call loadHarnessModels, and assert that modelsFor and isKnownModel exclude the disabled record while retaining the hidden record. Use the existing temporary project setup and cleanup so the global compatibility catalog is reset after each case; keep the existing decoder and encoder flag tests in place.
