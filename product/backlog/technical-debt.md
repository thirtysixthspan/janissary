# technical-debt

## ready

## development

* Use the shared atomic file writer for configuration updates so file permission handling cannot drift between persistence paths.

Existing Debt: Configuration maintains its own implementation of replacement through a temporary file even though the shared atomic writer performs the same operation and preserves existing file permissions. Severity: 4/10

Existing Risk: 4/10 - Updating a theme or remembered setting can replace a deliberately restricted configuration file with permissions derived from the process umask, broadening access to its contents.

Proposal Risk: 2/10 - The shared replacement preserves ordinary permission bits, while filesystem errors and concurrent permission changes by other processes remain possible.

Proposal: Replace the private `writeConfig` implementation in `src/config.ts` with serialization followed by `atomicWriteFile` from `src/atomic-write.ts`, retaining two-space formatting, the trailing newline, unknown key preservation, and updates to the running configuration only after a successful write. The shared helper reads the existing target mode and supplies it when writing the temporary sibling, while the configuration helper currently supplies no mode. Keep `src/config.test.ts` coverage for unknown keys, persistence, failed writes retaining the running setting, and temporary cleanup, and add a permission preservation assertion for an existing configuration file restricted to mode `0600`. Add the corresponding general permission assertion to `src/atomic-write.test.ts`, which currently covers binary writes and failed-replacement cleanup but does not pin mode preservation. Retain the atomic replacement contract in `product/specs/application-config.md`.

## deferred


## declined
