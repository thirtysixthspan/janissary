import type { PatchContent, PatchPlace } from './view-entry.js';

export interface MoveHop { from: PatchPlace; to: PatchPlace; order: number }
export interface MoveChain {
  origin: PatchPlace;
  current: PatchPlace;
  content: PatchContent;
  link: boolean;
  onDisk: boolean;
  hops: MoveHop[];
  ordinal: number;
}

export interface MoveRegistry {
  chains: MoveChain[];
  byPlace: Map<PatchPlace, Map<PatchContent, MoveChain[]>>;
  vacated: Set<PatchPlace>;
  nextOrder: number;
}

export function createMoveRegistry(): MoveRegistry {
  return { chains: [], byPlace: new Map(), vacated: new Set(), nextOrder: 0 };
}

function chainsAt(registry: MoveRegistry, place: PatchPlace, content: PatchContent): MoveChain[] {
  let contents = registry.byPlace.get(place);
  if (!contents) { contents = new Map(); registry.byPlace.set(place, contents); }
  let chains = contents.get(content);
  if (!chains) { chains = []; contents.set(content, chains); }
  return chains;
}

function insert(chains: MoveChain[], chain: MoveChain): void {
  let index = chains.length;
  chains.push(chain);
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2);
    if (chains[parent].ordinal <= chain.ordinal) break;
    chains[index] = chains[parent];
    index = parent;
  }
  chains[index] = chain;
}

function take(chains: MoveChain[]): MoveChain | undefined {
  const first = chains[0];
  const last = chains.pop();
  if (chains.length === 0 || !last) return first;
  let index = 0;
  while (index * 2 + 1 < chains.length) {
    const left = index * 2 + 1;
    const right = left + 1;
    const child = right < chains.length && chains[right].ordinal < chains[left].ordinal ? right : left;
    if (chains[child].ordinal >= last.ordinal) break;
    chains[index] = chains[child];
    index = child;
  }
  chains[index] = last;
  return first;
}

export function recordMove(registry: MoveRegistry, from: PatchPlace, to: PatchPlace, replacedLink: boolean): void {
  const previous = chainsAt(registry, from, from.content);
  let chain = from.exists ? take(previous) : undefined;
  if (!chain) {
    chain = { origin: from, current: from, content: from.content, link: from.linkText !== undefined,
      onDisk: from.existed && !registry.vacated.has(from) && !replacedLink, hops: [], ordinal: registry.chains.length };
    registry.chains.push(chain);
  }
  chain.hops.push({ from, to, order: registry.nextOrder++ });
  chain.current = to;
  insert(chainsAt(registry, to, chain.content), chain);
  registry.vacated.add(from);
}

export function survives(chain: MoveChain): boolean {
  return chain.current.exists && chain.current.content === chain.content && (!chain.link || chain.current.linkText !== undefined);
}

export function showsRename(chain: MoveChain): boolean {
  return chain.onDisk && survives(chain) && !chain.origin.exists && !chain.current.existed;
}
