import { startOfDay } from 'date-fns';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import PullToSync from '@/components/PullToSync';
import ScreenHeader from '@/components/ScreenHeader';
import SegmentedControl from '@/components/SegmentedControl';
import AskView from '@/components/feed/AskView';
import DynamicFeed from '@/components/feed/DynamicFeed';
import MagazineFeed from '@/components/feed/MagazineFeed';
import MosaicFeed from '@/components/feed/MosaicFeed';
import StoriesFeed from '@/components/feed/StoriesFeed';
import TrackingView from '@/components/feed/TrackingView';
import type { FeedLayoutProps } from '@/components/feed/shared';
import { BUILTIN_SEGMENTS } from '@/plugins/builtins';
import { upcoming, useEvents } from '@/store/events';
import { usePlugins } from '@/store/plugins';
import {
  useEffectiveTimeZone,
  useFeedLayout,
  useTimeFormat,
  type FeedLayout,
} from '@/store/settings';
import { useTracking } from '@/store/tracking';
import { colors } from '@/theme/tokens';

/**
 * The Feed tab (design lines 981-988) — one header and a segmented control.
 * The two built-in panes (Feed, Ask) sit beside one segment per installed
 * plugin; each plugin segment renders its own tracking content.
 */

const FEED = 'feed';
const ASK = 'ask';

const LAYOUTS: Record<FeedLayout, (props: FeedLayoutProps) => React.ReactElement> = {
  dynamic: DynamicFeed,
  magazine: MagazineFeed,
  mosaic: MosaicFeed,
  stories: StoriesFeed,
};

export default function FeedScreen() {
  const insets = useSafeAreaInsets();
  const timeFormat = useTimeFormat();
  const timeZone = useEffectiveTimeZone();
  const feedLayout = useFeedLayout();

  const added = usePlugins((s) => s.added);
  const hiddenBuiltIns = usePlugins((s) => s.hiddenBuiltIns);
  const [mode, setMode] = useState<string>(FEED);

  // Segments: Feed (always), then visible built-ins, then one per plugin.
  const segments = useMemo(() => {
    const builtIns = BUILTIN_SEGMENTS.filter((b) => !hiddenBuiltIns.includes(b.id)).map((b) => b.id);
    return [FEED, ...builtIns, ...added.map((p) => p.id)];
  }, [added, hiddenBuiltIns]);

  // If the active mode disappears (plugin removed, built-in hidden), fall back to Feed.
  useEffect(() => {
    if (!segments.includes(mode)) {
      setMode(FEED);
    }
  }, [segments, mode]);

  const labelFor = (m: string): string => {
    if (m === FEED) return 'Feed';
    const builtIn = BUILTIN_SEGMENTS.find((b) => b.id === m);
    if (builtIn) return builtIn.title;
    return added.find((p) => p.id === m)?.title ?? m;
  };

  const isPlugin = mode !== FEED && !BUILTIN_SEGMENTS.some((b) => b.id === mode);

  // Same day-rollover guard as the Events tab: "Today" must stop meaning
  // yesterday if the app is left open past midnight.
  const [today, setToday] = useState(() => startOfDay(new Date()));
  useEffect(() => {
    const tick = setInterval(() => {
      const now = startOfDay(new Date());
      setToday((prev) => (prev.getTime() === now.getTime() ? prev : now));
    }, 60_000);
    return () => clearInterval(tick);
  }, []);

  const events = useEvents((s) => upcoming(s, today));

  // The tracking dataset is seeded lazily; the pane is one tap away, so the
  // seed happens on mount rather than when the tab is switched.
  const ensureSeeded = useTracking((s) => s.ensureSeeded);
  useEffect(() => {
    void ensureSeeded();
  }, [ensureSeeded]);

  const Layout = LAYOUTS[feedLayout] ?? DynamicFeed;
  const layoutProps: FeedLayoutProps = useMemo(
    () => ({
      events,
      today,
      timeFormat,
      timeZone,
      onOpen: (id: string) => router.push(`/event/${id}`),
    }),
    [events, today, timeFormat, timeZone],
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="feed-screen">
      <ScreenHeader title={labelFor(mode)} testID="feed-header" />

      <SegmentedControl
        options={segments}
        value={mode}
        onChange={setMode}
        labelFor={labelFor}
        accessibilityLabel="Feed mode"
        style={styles.modes}
      />

      {/* Feed and plugin panes pull to sync; Ask does not. */}
      {mode === FEED ? (
        <PullToSync testID="feed-pull">
          {(scrollProps) => <Layout {...layoutProps} scrollProps={scrollProps} />}
        </PullToSync>
      ) : null}
      {mode === ASK ? (
        <AskView
          events={events}
          timeFormat={timeFormat}
          timeZone={timeZone}
          onOpenEvent={(id) => router.push(`/event/${id}`)}
        />
      ) : null}
      {isPlugin ? (
        <PullToSync testID="tracking-pull">
          {(scrollProps) => (
            <TrackingView
              pluginId={mode}
              onOpenItem={(id) => router.push(`/tracking/${id}`)}
              scrollProps={scrollProps}
            />
          )}
        </PullToSync>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.canvas,
    minHeight: 0,
  },
  modes: {
    // design line 750: `margin: 0 20px 10px`
    marginHorizontal: 20,
    marginBottom: 10,
    alignSelf: 'stretch',
  },
});
