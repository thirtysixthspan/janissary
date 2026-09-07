import type { ScheduleRpcCall } from '../protocol/schedule.js';
import { noParams, type ParamsDecoder } from './guards.js';

// Keyed by the union so a method added to `ScheduleRpcCall` without a decoder fails the build.
export const SCHEDULE_PARAMS: Record<ScheduleRpcCall['method'], ParamsDecoder> = {
  closeScheduleLaunch: noParams,
};
