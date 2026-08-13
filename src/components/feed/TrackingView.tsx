import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import AppPressable from '@/components/AppPressable';
import type { PullScrollProps } from '@/components/PullToSync';
import { ChevronRightIcon } from '@/components/icons';
import { describeWithSpec, groupItemsBySpec } from '@/plugins/derive';
import { buildDefaultSpec } from '@/plugins/defaultSpec';
import { loadPluginSpec, resolveSpecData, type ResolvedTrackingData } from '@/plugins/loader';
import { renderTree, type RenderContext } from '@/plugins/renderer';
import type { TrackingPluginSpec } from '@/plugins/schema';
import { compareTrackingItems, type TrackingItem } from '@/store/tracking';
import { colors, fonts } from '@/theme/tokens';

/**
 * The Tracking pane (design lines 818-931).
 *
 * Renders one plugin (by id): franchise filter pills, then grouped rows.
 * Data, grouping, per-row derivation, and the row body all come from the
 * plugin spec.
 */
export interface TrackingViewProps {
  /** The plugin to render. */
  pluginId: string;
  onOpenItem: (id: string) => void;
  /** Spread onto the vertical list so a wrapping `PullToSync` can drive it. */
  scrollProps?: PullScrollProps;
}

export default function TrackingView({ pluginId, onOpenItem, scrollProps }: TrackingViewProps) {
  const [franchise, setFranchise] = useState<string | null>(null);

  const now = useMemo(() => new Date(), []);
  const [spec, setSpec] = useState<TrackingPluginSpec>(() => buildDefaultSpec(now));
  const [data, setData] = useState<ResolvedTrackingData>(() => resolveSpecData(buildDefaultSpec(now)));

  // Load the plugin's spec + data; reset the franchise filter on change.
  useEffect(() => {
    let alive = true;
    loadPluginSpec(pluginId, now).then((s) => {
      if (alive) {
        setSpec(s);
        setData(resolveSpecData(s));
        setFranchise(null);
      }
    });
    return () => {
      alive = false;
    };
  }, [pluginId, now]);

  const pills = useMemo(
    () => data.franchises.filter((f) => data.items.some((i) => i.franchise === f.name)),
    [data],
  );
  const items = useMemo(() => {
    const sorted = [...data.items].sort((a, b) => compareTrackingItems(a, b, now));
    return franchise ? sorted.filter((i) => i.franchise === franchise) : sorted;
  }, [data, franchise, now]);
  const groups = useMemo(() => groupItemsBySpec(items, now, spec.derive), [items, now, spec]);

  const franchiseColor = (name: string): string =>
    data.franchises.find((f) => f.name === name)?.color ?? colors.ink;

  const showChevron = spec.list?.chevron ?? true;
  const showHairline = spec.list?.hairline ?? true;

  const rowContext = (item: TrackingItem): RenderContext => {
    const derived = describeWithSpec(item, now, spec.derive);
    const rec = item as unknown as Record<string, unknown>;
    return {
      item: { ...rec, start: item.start?.getTime() ?? null, end: item.end?.getTime() ?? null },
      derived: derived as unknown as Record<string, unknown>,
      color: franchiseColor(item.franchise),
    };
  };

  return (
    <View style={styles.root} testID="feed-tracking">
      <View style={styles.filterBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          <Pill
            label="All"
            selected={franchise === null}
            onPress={() => setFranchise(null)}
            testID="tracking-pill-All"
          />
          {pills.map((f) => (
            <Pill
              key={f.name}
              label={f.abbr}
              selected={franchise === f.name}
              onPress={() => setFranchise((prev) => (prev === f.name ? null : f.name))}
              testID={`tracking-pill-${f.abbr}`}
            />
          ))}
        </ScrollView>
      </View>

      <ScrollView {...scrollProps} style={styles.scroll} contentContainerStyle={styles.content}>
        {groups.map((bucket) => (
          <View key={bucket.group} style={styles.group}>
            <View style={styles.groupHeader}>
              <Text style={styles.groupLabel} testID={`tracking-group-${bucket.group}`}>
                {bucket.group}
              </Text>
            </View>

            {bucket.items.map((item) => (
              <AppPressable
                key={item.id}
                variant="row"
                accessibilityRole="button"
                accessibilityLabel={`${item.title}, ${item.franchise}`}
                testID={`tracking-row-${item.id}`}
                onPress={() => onOpenItem(item.id)}
                style={[styles.row, !showHairline && styles.rowNoHairline]}
              >
                {spec.listRow ? renderTree(spec.listRow, rowContext(item)) : null}
                {showChevron ? <ChevronRightIcon /> : null}
              </AppPressable>
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

/* ------------------------------------------------------------------- pill */

function Pill({
  label,
  selected,
  onPress,
  testID,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  testID: string;
}) {
  return (
    <AppPressable
      variant="button"
      accessibilityRole="button"
      accessibilityState={{ selected }}
      testID={testID}
      onPress={onPress}
      style={[styles.pill, selected && styles.pillSelected]}
    >
      <Text style={[styles.pillLabel, selected && styles.pillLabelSelected]}>{label}</Text>
    </AppPressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
  },

  filterBar: {
    paddingTop: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairlineStrong,
    flexShrink: 0,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 24,
  },
  pill: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: colors.hairline,
    flexShrink: 0,
  },
  pillSelected: {
    backgroundColor: colors.ink,
  },
  pillLabel: {
    fontSize: 12,
    fontFamily: fonts.semibold,
    color: colors.muted,
    letterSpacing: 0.2,
  },
  pillLabelSelected: {
    color: colors.canvas,
  },

  scroll: {
    flex: 1,
  },
  content: {
    paddingTop: 4,
    paddingBottom: 20,
  },
  group: {
    paddingHorizontal: 24,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    paddingTop: 18,
    paddingBottom: 10,
  },
  groupLabel: {
    fontSize: 13,
    fontFamily: fonts.bold,
    color: colors.ink,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  rowNoHairline: {
    borderBottomWidth: 0,
  },
});
