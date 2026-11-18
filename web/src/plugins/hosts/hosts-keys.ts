import type { HostRow } from '@shared/plugins/hosts/shared';

export type HostIdentity = {
  name: string;
  user: string;
  destination: string;
  path: string;
  filePath: string;
};

export function hostIdentity(row: HostRow, filePath: string): HostIdentity {
  return {
    name: row.name,
    user: row.user,
    destination: row.destination,
    path: row.path,
    filePath,
  };
}

export function sameHost(previous: HostIdentity | null, current: HostIdentity): boolean {
  return previous !== null
    && previous.name === current.name
    && previous.user === current.user
    && previous.destination === current.destination
    && previous.path === current.path
    && previous.filePath === current.filePath;
}

export function hostClickSelection(
  clicked: number,
  confirmed: number | null,
  previous: HostIdentity | null,
  current: HostIdentity,
): { selected: number; opens: boolean } {
  return { selected: clicked, opens: confirmed === clicked && sameHost(previous, current) };
}

export function hostTooltip(user: string, destination: string, path: string): string {
  const target = user.length > 0 ? `${user}@${destination}` : destination;
  return path.length > 0 ? `${target}\n${path}` : target;
}

export { nextListSelection as nextHostSelection } from '../api';
