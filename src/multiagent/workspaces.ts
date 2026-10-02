import type { Managers } from '../managers.js';
import { workspaceLabelError } from '../workspace/label.js';
import { errorText } from '../error-text.js';
import type { MultiAgentMember } from './types.js';

// The N clones a multi-agent tab's members work in. `Tab.workspaceDir` is a single scalar and the
// close walk releases exactly one through it, so eight clones cannot live there; they live here and
// are released from the manager's own `closeTab(label)`, which the walk already calls for every
// manager named in `MANAGER_TAB_RELEASE`.

// One distinct workspace name per member: `<tab label>-<model with / replaced by ->-<member index>`.
// The label part keeps two runs from colliding on a name and the model-derived part keeps the folder
// readable — a model holding a `/` becomes `-`, since the name has to be a single folder name
// directly under the workspace base.
//
// The index is what makes the name *provably* distinct rather than distinct in practice. Folding
// `/` to `-` is not injective: a project overriding `.janissary/harness-models.json` can carry both
// `a/b` and `a-b`, which would otherwise derive one name for two members — and `WorkspaceManager`
// keys its `refs` and `pending` maps by name, so the second `create` would overwrite the first's
// entries and both members would be handed one clone to write into concurrently. The bundled catalog
// cannot collide, which is precisely why relying on that was not good enough.
export function memberWorkspaceName(label: string, model: string, index: number): string {
  return `${label}-${model.replaceAll('/', '-')}-${index}`;
}

// A name that cannot name one folder is refused before `create` is called, rather than after a
// clone it would never have made. Reuses the workspace's own rule so both agree on what is legal.
function unusableName(label: string, model: string, index: number): boolean {
  return workspaceLabelError(memberWorkspaceName(label, model, index)) !== undefined;
}

// Start a clone per member, keyed by each member's distinct name. A member whose name cannot be a
// folder, or whose clone cannot start, is that member's `failed` with the reason and the rest of the
// run proceeds: a comparison of eight where one model was retired is still worth reading.
//
// `onReady` is called once per member whose clone landed, and never for one that failed — it is
// where the member is prompted.
export function provisionMembers(
  label: string,
  members: MultiAgentMember[],
  managers: Managers,
  onReady: (member: MultiAgentMember) => void,
): void {
  for (const member of members) {
    // A member already refused when the list was resolved against the catalog — an unknown model, a
    // repeat — is authoritative: it is never cloned and never prompted.
    if (member.state === 'failed') continue;
    const name = memberWorkspaceName(label, member.model, member.index);
    if (unusableName(label, member.model, member.index)) {
      member.state = 'failed';
      member.error = `Cannot provision a workspace named "${name}".`;
      continue;
    }
    const created = managers.workspace.create(name);
    if ('error' in created) {
      member.state = 'failed';
      member.error = created.error;
      continue;
    }
    member.dir = created.dir;
    member.state = 'cloning';
    const settle = async () => {
      try {
        await created.ready;
        onReady(member);
      } catch (error) {
        member.state = 'failed';
        member.error = errorText(error);
      }
    };
    void settle();
  }
}

// Release every member's clone, cancelling one still in flight so its tab closes right away instead
// of leaving an orphaned `git clone` running. The release itself is deferred to a macrotask exactly
// as the tab-close walk defers a single clone's: recursively removing a full clone is slow enough
// to freeze the UI if run inline. The clones stay tracked until `release` runs, so a shutdown before
// it fires still sweeps them.
export function releaseMembers(label: string, members: MultiAgentMember[], managers: Managers): void {
  for (const member of members) {
    managers.workspace.cancel(memberWorkspaceName(label, member.model, member.index));
    const dir = member.dir;
    if (dir) setTimeout(() => managers.workspace.release(dir), 0);
  }
}
