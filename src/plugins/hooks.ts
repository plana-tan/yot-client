import {
  daysLeft,
  daysUntil,
  group as defaultGroup,
  isActive,
  isRange,
  progress as defaultProgress,
  timeLabel as defaultTimeLabel,
  type TrackingItem,
} from '@/store/tracking';
import type { DeriveSpec } from '@/plugins/schema';

/** group(): default mode delegates to the existing pure function. */
export function applyGroup(
  hook: NonNullable<DeriveSpec['group']> | undefined,
  item: TrackingItem,
  now: Date,
): string {
  if (!hook) return defaultGroup(item, now);
  switch (hook.mode) {
    case 'deadline': {
      if (isActive(item, now)) return 'Active';
      if (item.start === null) return 'TBA';
      const until = daysUntil(item, now);
      return until !== null && until <= hook.thresholdDays ? 'This Week' : 'Later';
    }
    case 'category':
      return String((item as unknown as Record<string, unknown>)[hook.field] ?? '');
    case 'static':
      return hook.value;
  }
}

export function applyTimeLabel(
  hook: NonNullable<DeriveSpec['timeLabel']> | undefined,
  item: TrackingItem,
  now: Date,
): string {
  if (!hook || hook.mode === 'countdown') return defaultTimeLabel(item, now);
  // mode === 'date'
  if (!item.start) return 'TBA';
  // default ISO; date-fns format support is a follow-up if a plugin needs it
  return item.start.toISOString().slice(0, 10);
}

function elapsedTimeProgress(item: TrackingItem, now: Date): number {
  if (!item.start || !item.end) return 0;
  const span = item.end.getTime() - item.start.getTime();
  if (span <= 0) return 0;
  const elapsed = now.getTime() - item.start.getTime();
  return Math.min(1, Math.max(0, elapsed / span));
}

export function applyProgress(
  hook: NonNullable<DeriveSpec['progress']> | undefined,
  item: TrackingItem,
  now: Date,
): number {
  if (!hook) return defaultProgress(item, now);
  if (hook.mode === 'none') return 0;
  if (hook.mode === 'range') {
    return hook.basis === 'elapsed-time'
      ? elapsedTimeProgress(item, now)
      : defaultProgress(item, now);
  }
  const rec = item as unknown as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0);
  switch (hook.mode) {
    case 'index': {
      const total = num(rec[hook.totalField]);
      return total <= 0 ? 0 : Math.min(1, Math.max(0, num(rec[hook.currentField]) / total));
    }
    case 'ratio': {
      const total = num(rec[hook.totalField]);
      return total <= 0 ? 0 : Math.min(1, Math.max(0, num(rec[hook.doneField]) / total));
    }
    case 'threshold': {
      const v = num(rec[hook.valueField]);
      const t = hook.target;
      if (hook.direction === 'up') return t <= 0 ? 0 : Math.min(1, Math.max(0, v / t));
      return v <= t ? 1 : Math.min(1, Math.max(0, t / v));
    }
    default:
      return defaultProgress(item, now);
  }
}
