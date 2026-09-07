// Built-in names a tab plugin must not claim that have no `Command` entry of their own to reserve
// them. Every other built-in is reserved by being in the registry, and `shell`/`schedule` are
// reserved by `ROUTE_NAMES` in `../plugins/command-adapter.ts` as routes handled ahead of it.
//
// This module deliberately imports nothing. `../commands.ts` builds its command list from the
// registry, and the registry's module scope builds the plugin commands — so a reserved-name list
// living in `../commands.ts` would be read while that module was still initializing.
export const RESERVED_NON_COMMAND_NAMES = ['help'];
