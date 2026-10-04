import type { TabPluginDeclaration, TabPluginResources } from './api.js';

// `spawnTerminal` is granted on the resources a payload factory receives rather than on the
// capability object, because a tab's label does not exist until its factory returns — so it is gated
// on the declaration field that asks for it. `restrictToDeclared` walks the capability set and cannot
// reach a resource. The refusal matches the capability one: it throws the message a plugin author is
// looking for, rather than handing back a resource that quietly does nothing.
export function declaredResources(
  declaration: TabPluginDeclaration,
  resources: TabPluginResources,
): TabPluginResources {
  if (declaration.spawnTerminal) return resources;
  return {
    ...resources,
    spawnTerminal: () => {
      throw new Error('used resource "spawnTerminal" without declaring it');
    },
  };
}