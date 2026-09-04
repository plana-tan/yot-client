import { applyGroup, applyProgress, applyTimeLabel } from '@/plugins/hooks';
import type { DeriveSpec } from '@/plugins/schema';
import {
  describe,
  type TrackingDerived,
  type TrackingGroup,
  type TrackingItem,
} from '@/store/tracking';

/**
 * Like `describe`, but applies the plugin's derive hooks where present. Lives in
 * its own module (rather than `store/tracking`) to avoid a circular import:
 * `hooks` imports the store's pure functions, and this module imports both.
 */
export function describeWithSpec(
  item: TrackingItem,
  now: Date,
  derive?: DeriveSpec,
): TrackingDerived {
  const base = describe(item, now);
  const elapsedRange =
    derive?.progress?.mode === 'range' && derive.progress.basis === 'elapsed-time';
  const customProgress =
    derive?.progress != null && derive.progress.mode !== 'range' && derive.progress.mode !== 'none';
  return {
    ...base,
    group: applyGroup(derive?.group, item, now) as TrackingGroup,
    timeLabel: applyTimeLabel(derive?.timeLabel, item, now),
    progress: applyProgress(derive?.progress, item, now),
    // index/ratio/threshold hooks always carry a bar, regardless of date range.
    showProgress: elapsedRange
      ? item.start !== null && item.end !== null && item.end.getTime() > item.start.getTime()
      : customProgress
        ? true
        : base.showProgress,
  };
}

export interface PluginGroupBucket {
  group: string;
  items: TrackingItem[];
}

/** Bucket items by their spec-derived group label. Fixed order for the default
 *  (deadline) mode; first-appearance order for category/static modes. */
export function groupItemsBySpec(
  items: TrackingItem[],
  now: Date,
  derive?: DeriveSpec,
): PluginGroupBucket[] {
  const buckets: PluginGroupBucket[] = [];
  const index = new Map<string, PluginGroupBucket>();
  for (const item of items) {
    const g = applyGroup(derive?.group, item, now);
    let b = index.get(g);
    if (!b) {
      b = { group: g, items: [] };
      index.set(g, b);
      buckets.push(b);
    }
    b.items.push(item);
  }
  if (!derive?.group || derive.group.mode === 'deadline') {
    const order = ['Active', 'This Week', 'Later', 'TBA'];
    buckets.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));
  }
  return buckets;
}
