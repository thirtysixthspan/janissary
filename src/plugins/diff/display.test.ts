import { describe, expect, it } from 'vitest';
import { displayRoot } from './display.js';

const launchRoot = '/repo';
const sync = '/repo/.janissary/workspace/git-sync';

describe('displayRoot', () => {
  it('reads the shared git-sync clone and a path below it as $git-sync', () => {
    expect(displayRoot(sync, launchRoot)).toBe('$git-sync/');
    expect(displayRoot(`${sync}/product/plans`, launchRoot)).toBe('$git-sync/product/plans');
  });

  it('keeps a sibling that merely shares the git-sync prefix under $root', () => {
    expect(displayRoot('/repo/.janissary/workspace/git-sync-old', launchRoot))
      .toBe('$root/.janissary/workspace/git-sync-old');
  });

  it('still names the tab\'s own workspace clone first', () => {
    const workspace = '/repo/.janissary/workspace/emrah';
    expect(displayRoot(workspace, launchRoot, workspace)).toBe('$workspace/emrah');
  });

  it('still reads the launch directory and paths below it as $root', () => {
    expect(displayRoot(launchRoot, launchRoot)).toBe('$root/');
    expect(displayRoot('/repo/src', launchRoot)).toBe('$root/src');
  });
});
