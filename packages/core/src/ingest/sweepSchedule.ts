/**
 * Trigger.dev sweep schedule configuration.
 *
 * Per ADR 0008 (tracer-bullet delivery), the live sweep runs on a daily cron so
 * the deployed site stays current at near-zero effort. The cron lives here — not
 * in operational glue — so the value is reviewable and unit-testable, and so the
 * Trigger.dev task module stays a thin declaration.
 */

export const SWEEP_TASK_ID = 'sweep' as const;

export interface SweepSchedule {
  readonly pattern: string;
  readonly timezone: string;
}

export const SWEEP_DAILY_SCHEDULE: SweepSchedule = {
  pattern: '0 6 * * *',
  timezone: 'Europe/London',
};
