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
  ['fileNavigatorSetDetail', { index: 0, details: 'modified' }, [{ index: 0 }, { index: 0, details: 'owner' }]],
  ['fileNavigatorReroot', { index: 0 }, [{ index: 0, path: 4 }]],
  ['moveFileNavigatorItem', { index: 0, fromRelPath: 'a', toRelPath: 'b' }, [
    { index: 0, fromRelPath: 'a' },
    { index: 0, fromRelPath: 'a', toRelPath: [] },
  ]],
  ['moveFileNavigatorItems', { index: 0, sourcePaths: ['a'], destinationPath: 'b', policy: 'overwrite-all' }, [
    { index: 0, sourcePaths: 'a', destinationPath: 'b' },
    { index: 0, sourcePaths: ['a', 2], destinationPath: 'b' },
    { index: 0, sourcePaths: ['a'], destinationPath: 'b', policy: 'merge' },
  ]],
  ['pasteFileNavigatorItems', { index: 0, sources: ['/tmp/a'], destinationPath: '.', mode: 'copy' }, [
    { index: 0, sources: ['/tmp/a'], destinationPath: '.' },
    { index: 0, sources: ['/tmp/a'], destinationPath: '.', mode: 'copy', sourceHost: 7 },
  ]],
  ['deleteFileNavigatorItem', { index: 0, relPath: 'a' }, [{ index: 0 }]],
  ['deleteFileNavigatorItems', { index: 0, paths: [] }, [{ index: 0, paths: 'a' }]],
  ['renameFileNavigatorItem', { index: 0, relPath: 'a', newName: 'b' }, [
    { index: 0, relPath: 'a' },
    { index: 0, relPath: 'a', newName: 1 },
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
  ['fileNavigatorCreateFile', { index: 0, destination: '.' }, [{ index: 0 }]],
  ['fileNavigatorCreateDirectory', { index: 0, destination: '.' }, [{ index: 0, destination: 1 }]],
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
  ['undoFileNavigatorItem', { index: 0, overwrite: true }, [{ index: 0, skipConflicts: 'yes' }]],
  ['redoFileNavigatorItem', { index: 0 }, [{ index: 0, overwrite: 1 }]],
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
