import { SimulationTime } from '../types/simulation';

export const WORK_START_HOUR = 8;
export const WORK_END_HOUR = 18;

/**
 * Central working-hours policy used by both the movement system and the
 * behaviour tick. Keeping this in one place prevents the arrival state and the
 * wage logic from disagreeing about who is actually on shift.
 */
export function isWorkHours(time: SimulationTime): boolean {
  return time.hour >= WORK_START_HOUR && time.hour < WORK_END_HOUR;
}
