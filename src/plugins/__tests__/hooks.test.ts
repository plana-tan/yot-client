jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { addDays, startOfDay } from 'date-fns';
import { applyGroup, applyProgress, applyTimeLabel } from '@/plugins/hooks';
import { ProgressHookSchema } from '@/plugins/schema';
import { group, progress, timeLabel, type TrackingItem } from '@/store/tracking';

const NOW = new Date('2026-07-28T15:30:00');
const item = (o: Partial<TrackingItem>): TrackingItem => ({
  id: 'x', title: 'X', franchise: 'G', type: 'gacha',
  start: startOfDay(NOW), end: startOfDay(NOW), desc: '', ...o,
});

describe('derive hooks', () => {
  it('default group matches the pure function', () => {
    expect(applyGroup(undefined, item({ start: null }), NOW)).toBe(group(item({ start: null }), NOW));
  });
  it('deadline mode groups within threshold as This Week', () => {
    expect(applyGroup({ mode: 'deadline', thresholdDays: 7 }, item({ start: addDays(startOfDay(NOW), 3) }), NOW)).toBe('This Week');
  });
  it('category mode groups by field', () => {
    const it = item({}) as unknown as Record<string, unknown>;
    it.magazine = 'Jump';
    expect(applyGroup({ mode: 'category', field: 'magazine' }, it as unknown as TrackingItem, NOW)).toBe('Jump');
  });
  it('index progress computes current/total', () => {
    const it = item({}) as unknown as Record<string, unknown>;
    it.round = 6; it.totalRounds = 24;
    expect(applyProgress({ mode: 'index', currentField: 'round', totalField: 'totalRounds' }, it as unknown as TrackingItem, NOW)).toBeCloseTo(0.25);
  });
  it('ratio progress computes done/total', () => {
    const it = item({}) as unknown as Record<string, unknown>;
    it.done = 3; it.total = 10;
    expect(applyProgress({ mode: 'ratio', doneField: 'done', totalField: 'total' }, it as unknown as TrackingItem, NOW)).toBeCloseTo(0.3);
  });
  it('elapsed-time range progress follows the actual timestamps', () => {
    const start = new Date('2026-09-04T10:00:00Z');
    const end = new Date('2026-09-04T14:00:00Z');
    const flight = item({ start, end, type: 'flight' });
    const hook = { mode: 'range', basis: 'elapsed-time' } as const;

    expect(applyProgress(hook, flight, new Date('2026-09-04T09:00:00Z'))).toBe(0);
    expect(applyProgress(hook, flight, new Date('2026-09-04T12:00:00Z'))).toBeCloseTo(0.5);
    expect(applyProgress(hook, flight, new Date('2026-09-04T15:00:00Z'))).toBe(1);
  });

  it('elapsed-time range progress rejects a zero or reversed span', () => {
    const start = new Date('2026-09-04T10:00:00Z');
    const end = new Date('2026-09-04T14:00:00Z');
    const hook = { mode: 'range', basis: 'elapsed-time' } as const;

    expect(applyProgress(hook, item({ start, end: start }), start)).toBe(0);
    expect(applyProgress(hook, item({ start: end, end: start }), start)).toBe(0);
  });

  it('elapsed-time range progress rejects invalid dates instead of returning NaN', () => {
    const valid = new Date('2026-09-04T14:00:00Z');
    const invalid = new Date('not-a-date');
    const hook = { mode: 'range', basis: 'elapsed-time' } as const;

    expect(applyProgress(hook, item({ start: invalid, end: valid }), valid)).toBe(0);
    expect(applyProgress(hook, item({ start: valid, end: invalid }), valid)).toBe(0);
  });

  it.each([
    { mode: 'range' },
    { mode: 'range', basis: 'calendar-days' },
    { mode: 'range', basis: 'elapsed-time' },
  ])('parses the backward-compatible range hook %j', (hook) => {
    expect(ProgressHookSchema.safeParse(hook).success).toBe(true);
  });

  it('plain range mode keeps calendar-day behavior', () => {
    const ranged = item({
      start: addDays(startOfDay(NOW), -2),
      end: addDays(startOfDay(NOW), 2),
    });
    expect(applyProgress({ mode: 'range' }, ranged, NOW)).toBe(progress(ranged, NOW));
  });

  it('default progress/timeLabel match the pure functions', () => {
    const it = item({ end: addDays(startOfDay(NOW), 3) });
    expect(applyProgress(undefined, it, NOW)).toBe(progress(it, NOW));
    expect(applyTimeLabel(undefined, it, NOW)).toBe(timeLabel(it, NOW));
  });
});
