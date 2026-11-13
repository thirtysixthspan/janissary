import { lstatSync, mkdirSync, readlinkSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { checkLexicalPath, checkProtectedPath, checkRealTarget, type FilePolicyFailure } from '../file-read/policy.js';
import { failureResult, fileOperationReason, runFileOperation, type FileOperationResult } from '../file-navigator/file-operation-result.js';

export type WriteTarget = {
  realRoot: string;
  realPath: string;
  exists: boolean;
  missingSegments: string[];
};

type Ancestor = { realAncestor: string; missingSegments: string[] };

type ExistingCheck = { exists: false } | { exists: true; realPath: string };

const canonicalPath = realpathSync.native;

const NOT_A_DIRECTORY_REASON = fileOperationReason({ code: 'ENOTDIR' });

function hasCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

function checkMutablePath(realRoot: string, realPath: string): FilePolicyFailure | undefined {
  return checkRealTarget(realRoot, realPath) ?? checkProtectedPath(path.relative(realRoot, realPath));
}

function danglingEntryRefusal(realRoot: string, candidate: string): string | undefined {
  try {
    lstatSync(candidate);
  } catch (error) {
    return hasCode(error, 'ENOENT') ? undefined : fileOperationReason(error);
  }
  const linkTarget = runFileOperation(() => path.resolve(canonicalPath(path.dirname(candidate)), readlinkSync(candidate)));
  if (!linkTarget.ok) return linkTarget.reason;
  return checkMutablePath(realRoot, linkTarget.value) ?? 'Not a text file';
}

function findAncestor(realRoot: string, candidate: string, missingSegments: string[]): FileOperationResult<Ancestor> {
  try {
    return { ok: true, value: { realAncestor: canonicalPath(candidate), missingSegments } };
  } catch (error) {
    const parent = path.dirname(candidate);
    if (!hasCode(error, 'ENOENT') || parent === candidate) return failureResult(fileOperationReason(error));
    const dangling = danglingEntryRefusal(realRoot, candidate);
    if (dangling !== undefined) return failureResult(dangling);
    return findAncestor(realRoot, parent, [path.basename(candidate), ...missingSegments]);
  }
}

function classifyExisting(realTarget: string): FilePolicyFailure | undefined {
  const stats = statSync(realTarget);
  if (stats.isDirectory()) return 'Is a directory';
  return stats.isFile() ? undefined : 'Not a text file';
}

function followSymlink(realRoot: string, location: string): FileOperationResult<string> {
  let realTarget: string;
  try {
    realTarget = canonicalPath(location);
  } catch {
    return failureResult('Not a text file');
  }
  const failure = checkMutablePath(realRoot, realTarget);
  return failure === undefined ? { ok: true, value: realTarget } : failureResult(failure);
}

function checkExisting(realRoot: string, location: string): FileOperationResult<ExistingCheck> {
  let isSymlink: boolean;
  try {
    isSymlink = lstatSync(location).isSymbolicLink();
  } catch (error) {
    return hasCode(error, 'ENOENT') ? { ok: true, value: { exists: false } } : failureResult(fileOperationReason(error));
  }
  const followed = isSymlink ? followSymlink(realRoot, location) : { ok: true as const, value: location };
  if (!followed.ok) return followed;
  const classified = runFileOperation(() => classifyExisting(followed.value));
  if (!classified.ok) return classified;
  if (classified.value !== undefined) return failureResult(classified.value);
  return { ok: true, value: { exists: true, realPath: followed.value } };
}

function checkContainedPaths(realRoot: string, realPaths: string[]): FilePolicyFailure | undefined {
  for (const realPath of realPaths) {
    const failure = checkMutablePath(realRoot, realPath);
    if (failure !== undefined) return failure;
  }
  return undefined;
}

function resolveRoot(root: string): FileOperationResult<string> {
  return runFileOperation(() => canonicalPath(root));
}

function resolveRootItself(realRoot: string): FileOperationResult<WriteTarget> {
  const existing = checkExisting(realRoot, realRoot);
  if (!existing.ok) return existing;
  return failureResult('Is a directory');
}

function resolveBelowRoot(realRoot: string, resolved: string): FileOperationResult<WriteTarget> {
  const ancestor = findAncestor(realRoot, path.dirname(resolved), []);
  if (!ancestor.ok) return ancestor;
  const { realAncestor, missingSegments } = ancestor.value;
  const isDirectory = runFileOperation(() => statSync(realAncestor).isDirectory());
  if (!isDirectory.ok) return isDirectory;
  if (!isDirectory.value) return failureResult(NOT_A_DIRECTORY_REASON);
  const lexicalDestination = path.join(realAncestor, ...missingSegments, path.basename(resolved));
  const containment = checkContainedPaths(realRoot, [realAncestor, lexicalDestination]);
  if (containment !== undefined) return failureResult(containment);
  const base = { realRoot, missingSegments };
  if (missingSegments.length > 0) return { ok: true, value: { ...base, realPath: lexicalDestination, exists: false } };
  const existing = checkExisting(realRoot, lexicalDestination);
  if (!existing.ok) return existing;
  if (!existing.value.exists) return { ok: true, value: { ...base, realPath: lexicalDestination, exists: false } };
  return { ok: true, value: { ...base, realPath: existing.value.realPath, exists: true } };
}

function escapesLexically(requested: string): boolean {
  const normalized = path.normalize(requested);
  return path.isAbsolute(requested) || normalized === '..' || normalized.startsWith(`..${path.sep}`);
}

export function namesDirectory(requested: string): boolean {
  if (requested.endsWith('/') || requested.endsWith(path.sep)) return true;
  const last = requested.split('/').at(-1)?.split(path.sep).at(-1);
  return (last === '.' || last === '..') && !escapesLexically(requested);
}

export function resolveMutationTarget(root: string, requested: string): FileOperationResult<WriteTarget> {
  if (namesDirectory(requested)) return failureResult('Is a directory');
  const resolved = path.resolve(root, requested);
  const lexical = checkLexicalPath(root, requested) ?? checkProtectedPath(path.relative(root, resolved));
  if (lexical !== undefined) return failureResult(lexical);
  const realRoot = resolveRoot(root);
  if (!realRoot.ok) return realRoot;
  if (path.relative(root, resolved) === '') return resolveRootItself(realRoot.value);
  return resolveBelowRoot(realRoot.value, path.join(realRoot.value, path.relative(root, resolved)));
}

function recheckDestination(target: WriteTarget): FileOperationResult<string> {
  const realParent = runFileOperation(() => canonicalPath(path.dirname(target.realPath)));
  if (!realParent.ok) return realParent;
  const destination = path.join(realParent.value, path.basename(target.realPath));
  const containment = checkContainedPaths(target.realRoot, [realParent.value, destination]);
  if (containment !== undefined) return failureResult(containment);
  const existing = checkExisting(target.realRoot, destination);
  if (!existing.ok) return existing;
  return { ok: true, value: existing.value.exists ? existing.value.realPath : destination };
}

export function createTargetParents(target: WriteTarget): FileOperationResult<string> {
  if (target.missingSegments.length > 0) {
    const created = runFileOperation(() => mkdirSync(path.dirname(target.realPath), { recursive: true }));
    if (!created.ok) return created;
  }
  return recheckDestination(target);
}
