import { headLinesOperation } from './head-lines-operation.js';
import { listDirectoryOperation } from './list-directory-operation.js';
import { pathExistsOperation } from './path-exists-operation.js';
import { statPathOperation } from './stat-path-operation.js';
import { tailLinesOperation } from './tail-lines-operation.js';

export const TYPED_READ_OPERATIONS = {
  'list-directory': listDirectoryOperation,
  'stat-path': statPathOperation,
  'path-exists': pathExistsOperation,
  'head-lines': headLinesOperation,
  'tail-lines': tailLinesOperation,
};
