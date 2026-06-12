import { describe, expect, it } from 'vitest';
import { SWEEP_TASK_ID, SWEEP_DAILY_SCHEDULE } from './sweepSchedule.js';

describe('SWEEP_TASK_ID', () => {
  it('matches the Trigger.dev sweep task identifier', () => {
    expect(SWEEP_TASK_ID).toBe('sweep');
  });
});

describe('SWEEP_DAILY_SCHEDULE', () => {
  it('is a five-field cron pattern (minute hour day-of-month month day-of-week)', () => {
    const fields = SWEEP_DAILY_SCHEDULE.pattern.split(/\s+/);
    expect(fields).toHaveLength(5);
  });

  it('fires once per day — no minute/hour ranges, no step expressions', () => {
    const [minute, hour, dom, month, dow] = SWEEP_DAILY_SCHEDULE.pattern.split(/\s+/);
    expect(minute).toMatch(/^\d+$/);
    expect(hour).toMatch(/^\d+$/);
    expect(dom).toBe('*');
    expect(month).toBe('*');
    expect(dow).toBe('*');
  });

  it('runs in Europe/London so daily cadence matches Glasgow local time', () => {
    expect(SWEEP_DAILY_SCHEDULE.timezone).toBe('Europe/London');
  });
});
