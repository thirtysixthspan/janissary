import { describe, expect, it } from 'vitest';
import { FILE_NAVIGATOR_PARAMS } from './file-navigator.js';

const CASES: Array<[
  keyof typeof FILE_NAVIGATOR_PARAMS,
  Record<string, unknown>,
  Array<Record<string, unknown>>,
]> = [
  ['fileNavigatorToggle', { index: 0, path: 'src' }, [{ index: 0 }, { index: 0, path: 3 }]],
  ['fileNavigatorCollapseAll', { index: 0 }, [{}, { index: '0' }]],
  ['fileNavigatorPull', { index: 1 }, [{ index: null }]],
  // An empty path array is accepted: that is the header button's whole-tree form.
  ['fileNavigatorCommit', { index: 0, message: 'commit: a.md', paths: [] }, [
    { index: 0, paths: [] },
    { index: 0, message: 7, paths: [] },
    { index: 0, message: 'commit: a.md', paths: 'a.md' },
    { index: 0, message: 'commit: a.md', paths: ['a.md', 2] },
  ]],
  ['fileNavigatorNothingToCommit', { index: 0 }, [{ index: '0' }, {}]],
  ['fileNavigatorSetDetail', { index: 0, details: 'modified' }, [{ index: 0 }, { index: 0, details: 'owner' }]],
  ['fileNavigatorReroot', { index: 0 }, [{ index: 0, path: 4 }]],
  ['moveFileNavigatorItem', { label: 'files', fromRelPath: 'a', toRelPath: 'b' }, [
    { label: 'files', fromRelPath: 'a' },
    { label: 'files', fromRelPath: 'a', toRelPath: [] },
    { label: 'files', fromRelPath: 'a', toRelPath: 'b', overwrite: 'yes' },
  ]],
  ['moveFileNavigatorItem', { label: 'files', fromRelPath: 'a', toRelPath: 'b', overwrite: true }, []],
  ['moveFileNavigatorItems', { label: 'files', sourcePaths: ['a'], destinationPath: 'b', policy: 'overwrite-all' }, [
    { label: 'files', sourcePaths: 'a', destinationPath: 'b' },
    { label: 'files', sourcePaths: ['a', 2], destinationPath: 'b' },
    { label: 'files', sourcePaths: ['a'], destinationPath: 'b', policy: 'merge' },
  ]],
  ['pasteFileNavigatorItems', { label: 'files', sources: ['/tmp/a'], destinationPath: '.', mode: 'copy' }, [
    { label: 'files', sources: ['/tmp/a'], destinationPath: '.' },
    { label: 'files', sources: ['/tmp/a'], destinationPath: '.', mode: 'copy', sourceHost: 7 },
  ]],
  ['deleteFileNavigatorItem', { label: 'files', relPath: 'a' }, [{ label: 'files' }, { index: 0, relPath: 'a' }, { label: 3, relPath: 'a' }]],
  ['deleteFileNavigatorItems', { label: 'files', paths: [] }, [{ label: 'files', paths: 'a' }]],
  ['renameFileNavigatorItem', { label: 'files', relPath: 'a', newName: 'b' }, [
    { label: 'files', relPath: 'a' },
    { label: 'files', relPath: 'a', newName: 1 },
  ]],
  ['fileNavigatorSearch', { index: 0 }, [{ index: {} }]],
  ['revealFileNavigatorItem', { index: 0, relPath: 'a/b' }, [{ index: 0, relPath: null }]],
  ['fileNavigatorOpeners', { index: 0, relPath: 'a', edit: true, all: false }, [
    { index: 0, relPath: 'a' },
    { index: 0, relPath: 'a', edit: 'true' },
    { index: 0, relPath: 'a', edit: true, all: 'no' },
  ]],
  ['fileNavigatorOpen', { index: 0, relPath: 'a', command: 'open external' }, [
    { index: 0, relPath: 'a', command: 'launch' },
  ]],
  ['fileNavigatorCreateFile', { label: 'files', destination: '.' }, [{ label: 'files' }, { index: 0, destination: '.' }]],
  ['fileNavigatorCreateDirectory', { label: 'files', destination: '.' }, [{ label: 'files', destination: 1 }, { index: 0, destination: '.' }]],
  ['fileNavigatorSelectionAction', { index: 0, paths: ['a'] }, [{ index: 0, paths: [1] }]],
  ['runFileNavigatorSelectionAction', { index: 0, paths: ['a'], action: 'play' }, [
    { index: 0, paths: ['a'] },
  ]],
  ['reportFileNavigatorSelection', { id: 4, navigators: [{ index: 0, selected: ['a'], cursor: 'a' }] }, [
    { id: 4, navigators: [{ index: 0 }] },
    { id: 4, navigators: [{ index: 0, selected: 'a' }] },
    { id: 4, navigators: [{ index: 0, selected: [], anchor: 2 }] },
    { id: '4', navigators: [] },
    { id: 4, navigators: {} },
  ]],
  ['undoFileNavigatorItem', { label: 'files', overwrite: true }, [{ label: 'files', skipConflicts: 'yes' }, { index: 0 }]],
  ['redoFileNavigatorItem', { label: 'files' }, [{ label: 'files', overwrite: 1 }, { index: 0 }]],
  ['openFileNavigatorFor', { label: 'files' }, [{}]],
];

describe('file navigator RPC params decoders', () => {
  it.each(CASES)('accepts the %s params the client sends', (method, valid) => {
    expect(FILE_NAVIGATOR_PARAMS[method](valid)).toBe(true);
  });

  it.each(CASES)('rejects malformed %s params', (method, _valid, invalid) => {
    for (const params of invalid) expect(FILE_NAVIGATOR_PARAMS[method](params)).toBe(false);
  });
});
