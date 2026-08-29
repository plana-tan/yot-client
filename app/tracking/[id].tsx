import { differenceInCalendarDays, startOfDay } from 'date-fns';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AppPressable from '@/components/AppPressable';
import { BackChevronIcon } from '@/components/icons';
import { describeWithSpec } from '@/plugins/derive';
import { resolveActions } from '@/plugins/actions';
import { buildDefaultSpec } from '@/plugins/defaultSpec';
import { loadPluginSpec, resolveSpecData } from '@/plugins/loader';
import { renderTree, type RenderContext } from '@/plugins/renderer';
import type { TrackingPluginSpec } from '@/plugins/schema';
import {
  describe,
  franchiseFor,
  isRange,
  itemById,
  useTracking,
  type TrackingItem,
} from '@/store/tracking';
import { useTheme } from '@/theme/context';
import { fonts, type } from '@/theme/tokens';
import type { Colors } from '@/theme/tokens';

/**
 * Tracking detail (design lines 933-979).
 *
 * Two data paths:
 * - `?plugin=<id>` (feed plugin rows): the item lives in that plugin's server
 *   spec, so the spec is fetched and the body renders the spec's `detail`
 *   element tree — the host only supplies back chrome and scroll.
 * - no param (demo dataset): the item comes from the tracking store and the
 *   native detail layout renders (franchise eyebrow, countdown, progress bar).
 */

interface SpecHit {
  spec: TrackingPluginSpec;
  item?: TrackingItem;
}

export default function TrackingDetailScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { id, plugin } = useLocalSearchParams<{ id: string; plugin?: string }>();
  const insets = useSafeAreaInsets();
  const now = useMemo(() => new Date(), []);

  // Spec-driven path: fetch the plugin spec and find the item in it.
  const [hit, setHit] = useState<SpecHit | null>(null);
  const [specLoading, setSpecLoading] = useState(Boolean(plugin));
  useEffect(() => {
    if (!plugin || !id) {
      setHit(null);
      setSpecLoading(false);
      return;
    }
    let alive = true;
    setSpecLoading(true);
    loadPluginSpec(plugin, now).then((spec) => {
      if (!alive) return;
      const data = resolveSpecData(spec);
      setHit({ spec, item: data.items.find((i) => i.id === id) });
      setSpecLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [plugin, id, now]);

  // Legacy path: the demo dataset lives in the tracking store.
  const storeItem = useTracking((s) => (id ? itemById(s, id) : undefined));
  const storeColor = useTracking((s) => {
    const it = id ? itemById(s, id) : undefined;
    return it ? franchiseFor(s, it.franchise)?.color : undefined;
  });

  const isSpec = Boolean(plugin);
  const item = isSpec ? hit?.item : storeItem;
  const color = isSpec
    ? item
      ? hit?.spec.data.franchises.find((f) => f.name === item.franchise)?.color
      : undefined
    : storeColor;

  const back = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/feed');
  }, []);

  const BackLink = (
    <AppPressable
      variant="none"
      accessibilityRole="button"
      accessibilityLabel="Back"
      testID="tracking-back"
      onPress={back}
      style={styles.backLink}
    >
      <BackChevronIcon />
      <Text style={styles.backLabel}>Back</Text>
    </AppPressable>
  );

  if (specLoading) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]} testID="tracking-detail">
        <View style={styles.header}>{BackLink}</View>
      </View>
    );
  }

  if (!item) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]} testID="tracking-detail-missing">
        <View style={styles.header}>{BackLink}</View>
        <View style={styles.missing}>
          <Text style={styles.missingTitle}>Not found</Text>
        </View>
      </View>
    );
  }

  // Spec-driven body: the plugin owns the whole detail layout.
  const spec = hit?.spec;
  const detailTree = spec?.detail ?? (isSpec ? buildDefaultSpec(now).detail : undefined);
  if (isSpec && detailTree && spec) {
    const derived = describeWithSpec(item, now, hit?.spec.derive);
    const rec = item as unknown as Record<string, unknown>;
    const ctx: RenderContext = {
      // Serialized context contract (spec §6): dates stay ISO strings.
      item: { ...rec, start: item.start?.toISOString() ?? null, end: item.end?.toISOString() ?? null },
      derived: derived as unknown as Record<string, unknown>,
      color: color ?? colors.ink,
      actions: resolveActions(spec, item, {
        openItem: (targetId: string) => router.push(`/tracking/${targetId}?plugin=${plugin}`),
      }),
      colors,
    };
    return (
      <View style={[styles.root, { paddingTop: insets.top }]} testID="tracking-detail">
        <View style={styles.header}>{BackLink}</View>
        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
          {renderTree(detailTree, ctx)}
        </ScrollView>
      </View>
    );
  }

  const derived = describe(item, now);
  const ranged = isRange(item);
  const showBar = ranged && derived.isActive;

  // Design line 945, branch order preserved. "N days left" outranks "Today",
  // so an item that both starts and ends today reads "0 days left"; the
  // "Today" branch is for one that starts today without having begun.
  const countdown = (() => {
    if (derived.isActive && derived.daysLeft !== null) return `${derived.daysLeft} days left`;
    if (derived.daysUntil === null) return 'TBA';
    if (derived.daysUntil === 0) return 'Today';
    return `In ${derived.daysUntil} days`;
  })();

  const spanDays =
    item.start && item.end ? differenceInCalendarDays(item.end, item.start) : 0;
  const elapsedDays = item.start
    ? differenceInCalendarDays(startOfDay(now), item.start)
    : 0;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="tracking-detail">
      <View style={styles.header}>
        {BackLink}
        <Text style={styles.franchise} testID="tracking-franchise">
          {item.franchise}
        </Text>
        <Text style={styles.title} testID="tracking-title">
          {item.title}
        </Text>
        <Text style={styles.countdown} testID="tracking-countdown">
          {countdown}
        </Text>
      </View>

      {showBar ? (
        <View style={styles.progressWrap} testID="tracking-progress">
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${Math.round(derived.progress * 100)}%`,
                  backgroundColor: color ?? colors.ink,
                },
              ]}
            />
          </View>
          {derived.daysLeft !== null ? (
            <View style={styles.progressCaption}>
              <Text style={styles.ago}>{`${elapsedDays}d ago`}</Text>
              <Text style={styles.left}>{`${derived.daysLeft}d left`}</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        <Text style={styles.desc}>{item.desc}</Text>

        <View style={styles.meta}>
          <View style={[styles.metaRow, styles.metaHairline]}>
            <Text style={styles.metaLabel}>Type</Text>
            <Text style={[styles.metaValue, styles.metaValueCapitalized]}>{item.type}</Text>
          </View>
          {ranged ? (
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Duration</Text>
              <Text style={styles.metaValue}>{`${spanDays} days`}</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.canvas,
    },
  header: {
    paddingTop: 14,
    paddingHorizontal: 24,
  },
  backLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 24,
  },
  backLabel: {
    fontSize: 14,
    fontFamily: fonts.medium,
    color: colors.muted,
  },
  franchise: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: colors.faintWarm,
    marginBottom: 4,
  },
  title: {
    ...type.detailTitle,
    color: colors.ink,
    marginBottom: 8,
  },
  countdown: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: colors.muted,
    marginBottom: 20,
  },

  progressWrap: {
    paddingHorizontal: 24,
    paddingBottom: 20,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.hairlineStrong,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  progressCaption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  ago: {
    fontSize: 11,
    fontFamily: fonts.regular,
    color: colors.chevron,
  },
  left: {
    fontSize: 11,
    fontFamily: fonts.semibold,
    color: colors.muted,
  },

  body: {
    flex: 1,
  },
  bodyContent: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  desc: {
    fontSize: 15,
    fontFamily: fonts.regular,
    color: colors.body,
    // design: `line-height: 1.7`
    lineHeight: 25.5,
    marginBottom: 24,
  },
  meta: {
    borderTopWidth: 1,
    borderTopColor: colors.hairlineStrong,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  metaHairline: {
    borderBottomWidth: 1,
    borderBottomColor: colors.hairlineFaint,
  },
  metaLabel: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: colors.muted,
  },
  metaValue: {
    fontSize: 13,
    fontFamily: fonts.semibold,
    color: colors.ink,
  },
  metaValueCapitalized: {
    textTransform: 'capitalize',
  },

  missing: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  missingTitle: {
    ...type.screenTitle,
    color: colors.ink,
  },
});
