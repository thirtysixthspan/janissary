import type { MonitorRpcCall } from '../protocol/monitor.js';
import { isBoolean, isString, type ParamsDecoder } from './guards.js';

// Keyed by the union so a method added to `MonitorRpcCall` without a decoder fails the build.
export const MONITOR_PARAMS: Record<MonitorRpcCall['method'], ParamsDecoder> = {
  runSuggestion: (p) => isString(p.id),
  rateSuggestion: (p) => isString(p.id) && isBoolean(p.up),
  resetMonitorContext: (p) => isString(p.name),
  monitorContextSnapshot: (p) => isString(p.name),
};
