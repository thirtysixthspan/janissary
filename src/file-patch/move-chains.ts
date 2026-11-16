import type { PatchContent, PatchPlace } from './view-entry.js';

export interface MoveHop { from: PatchPlace; to: PatchPlace; order: number }
export interface MoveChain {
  origin: PatchPlace;
  current: PatchPlace;
  content: PatchContent;
  link: boolean;
  onDisk: boolean;
  hops: MoveHop[];
}

export function recordMove(chains: MoveChain[], from: PatchPlace, to: PatchPlace, replacedLink: boolean): void {
  const order = chains.reduce((count, chain) => count + chain.hops.length, 0);
  let chain = chains.find((item) => item.current === from && item.content === from.content && from.exists);
  if (!chain) {
    const vacated = chains.some((item) => item.hops.some((hop) => hop.from === from));
    chain = { origin: from, current: from, content: from.content, link: from.linkText !== undefined,
      onDisk: from.existed && !vacated && !replacedLink, hops: [] };
    chains.push(chain);
  }
  chain.hops.push({ from, to, order });
  chain.current = to;
}

export function survives(chain: MoveChain): boolean {
  return chain.current.exists && chain.current.content === chain.content && (!chain.link || chain.current.linkText !== undefined);
}

export function showsRename(chain: MoveChain): boolean {
  return chain.onDisk && survives(chain) && !chain.origin.exists && !chain.current.existed;
}
