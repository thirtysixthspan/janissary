import type { CoreRpcCall } from '../protocol/core-rpc.js';
import {
  isFiniteNumber, isInteger, isOneOf, isRecord, isString, noParams, type ParamsDecoder,
} from './guards.js';

const DIRECTIONS = [-1, 1];
const DOCKS = ['left', 'right', null];

// `AcpRef` is a discriminated union of three arms, so the scope decides which fields are read.
function isAcpRef(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.scope === 'tab') return isString(value.label);
  if (value.scope === 'monitor') return isString(value.name);
  if (value.scope === 'editor') return isString(value.label) && isString(value.persona);
  return false;
}

// Keyed by the union so a method added to `CoreRpcCall` without a decoder fails the build, the same
// way `CLIENT_FRAME_TYPES` and `CAPABILITIES` are keyed by theirs.
export const CORE_PARAMS: Record<CoreRpcCall['method'], ParamsDecoder> = {
  init: noParams,
  command: (p) => isString(p.text),
  setActiveTab: (p) => isInteger(p.index),
  focusTab: (p) => isString(p.label),
  closeTab: (p) => isInteger(p.index),
  renameTab: (p) => isInteger(p.index) && isString(p.title),
  editQueuedCommand: (p) => isInteger(p.index) && isString(p.text),
  deleteQueuedCommand: (p) => isInteger(p.index),
  moveTab: (p) => isOneOf(p.dir, DIRECTIONS),
  moveTabToOtherPane: (p) => isInteger(p.index),
  reorderTab: (p) => isOneOf(p.dir, DIRECTIONS),
  reorderTabTo: (p) => isInteger(p.from) && isInteger(p.to),
  toggleCollapse: noParams,
  promoteToTerminal: noParams,
  chooseRoute: (p) => isInteger(p.index),
  closeHarnessLaunch: noParams,
  answerQuestion: (p) => isString(p.tab) && isString(p.id) && (p.answer === null || isString(p.answer)),
  complete: (p) => isString(p.text) && isInteger(p.cursor),
  resize: (p) => isInteger(p.cols) && isInteger(p.rows),
  ptyInput: (p) => isString(p.id) && isString(p.data),
  ptyResize: (p) => isString(p.id) && isInteger(p.cols) && isInteger(p.rows),
  ptyKill: (p) => isString(p.id),
  reportLayout: (p) => isFiniteNumber(p.sidebarLeft) && isFiniteNumber(p.sidebarRight) && isFiniteNumber(p.tabAreaPct),
  setDock: (p) => isInteger(p.index) && isOneOf(p.dock, DOCKS),
  launchAgentFor: (p) => isString(p.label),
  openTranscriptFor: (p) => isString(p.label),
  openHarnessTranscriptFor: (p) => isString(p.label),
  openAcpTranscript: (p) => isAcpRef(p.acpRef),
  projectFiles: noParams,
};
