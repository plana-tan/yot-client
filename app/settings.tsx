import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  SlideInRight,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { logout } from '@/api/client';
import AppPressable from '@/components/AppPressable';
import SectionLabel from '@/components/SectionLabel';
import SegmentedControl from '@/components/SegmentedControl';
import Toggle from '@/components/Toggle';
import { BackChevronIcon, CheckIcon, ChevronRightIcon } from '@/components/icons';
import PluginPicker from '@/components/feed/PluginPicker';
import { listPlugins } from '@/plugins/loader';
import { PLUGIN_SPEC_CACHE_KEY } from '@/plugins/specCache';
import type { PluginMeta } from '@/plugins/schema';
import { formatByteSize, utf8ByteLength } from '@/lib/bytes';
import { EVENTS_CACHE_KEY, useEvents } from '@/store/events';
import { clearLocalSessionData } from '@/store/sessionTeardown';
import {
  DEFAULT_VIEWS,
  FEED_LAYOUTS,
  deviceTimeZone,
  useSettings,
  type DefaultView,
  type FeedLayout,
  type TimeFormat,
  type TzMode,
  type WeekStart,
} from '@/store/settings';
import { useTheme } from '@/theme/context';
import { durations, easing, fonts, layout, radii, type } from '@/theme/tokens';
import type { Colors, ThemePreference } from '@/theme/tokens';

/**
 * Settings (design lines 1218-1261).
 *
 * A pushed screen — the stack supplies the slide-in the prototype animated by
 * hand — with a "Back" link, a 26/800 title and four groups of rows that
 * stagger in on the design's `fadeUp`.
 *
 * Every Display row is *wired*: the calendar grid and week strip read
 * `weekStart`, all clock rendering goes through `lib/dates` with `timeFormat`,
 * `defaultView` picks the landing tab in the root layout, and `feedLayout`
 * selects one of the four feed renderers. The two Agent toggles persist and do
 * nothing else — Yot has no notion of them, which is the documented behaviour.
 *
 * Deviations from the prototype:
 *  - **Disconnect asks first.** The prototype dropped the session on a single
 *    tap. Revoking an API key server-side deserves a confirmation, and it is
 *    rendered in-page rather than with `Alert` because `Alert` is a no-op in
 *    react-native-web and this screen has to work in the web build too.
 *  - **Local cache shows the real number**, measured from the AsyncStorage
 *    snapshot, instead of the mock's hardcoded "2.3 MB".
 *  - The three value rows (Region / Default view / Feed layout) open a picker;
 *    in the prototype their `onClick` handlers were empty.
 */

const STANDARD = Easing.bezier(...easing.standard);

/** Stagger between consecutive rows — the design's 0.02-0.08s spread. */
const STAGGER_MS = 40;

/** Fixed segment width from the design (`sSeg`'s default `w = 50`). */
const SEG_WIDTH = 50;
/** Auto/Manual needs more room — the design passes `62`. */
const SEG_WIDTH_TZ = 62;

/** `ui-monospace, Menlo, monospace`, spelled the way each platform needs. */
const MONO = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  default: 'ui-monospace, Menlo, Consolas, monospace',
});

const VIEW_LABELS: Record<DefaultView, string> = {
  calendar: 'Calendar',
  events: 'Events',
  feed: 'Feed',
};

const LAYOUT_LABELS: Record<FeedLayout, string> = {
  dynamic: 'Dynamic',
  magazine: 'Magazine',
  mosaic: 'Mosaic',
  stories: 'Stories',
};

/**
 * A short list of common IANA zones. A full tzdb list is ~600 entries and
 * would need a search field; this is the "simple region list" the plan asked
 * for, with the device's own zone spliced in so it is always selectable.
 */
const COMMON_ZONES = [
  'UTC',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Madrid',
  'Europe/Athens',
  'Europe/Moscow',
  'Africa/Lagos',
  'Africa/Cairo',
  'Africa/Johannesburg',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Bangkok',
  'Asia/Shanghai',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Australia/Perth',
  'Australia/Sydney',
  'Pacific/Auckland',
  'America/Sao_Paulo',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
];

export function zoneOptions(current: string): string[] {
  const zones = [...COMMON_ZONES];
  for (const zone of [deviceTimeZone(), current]) {
    if (zone && !zones.includes(zone)) zones.push(zone);
  }
  return zones;
}

/* ----------------------------------------------------------------- fadeUp */

/**
 * `fadeUp 0.45s cubic-bezier(.22,1,.36,1) <delay>s both` — opacity 0 -> 1 with
 * a 10px rise, staggered down the page.
 */
function FadeUp({
  delay = 0,
  style,
  children,
}: {
  delay?: number;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      delay,
      withTiming(1, { duration: durations.entrance, easing: STANDARD }),
    );
  }, [delay, progress]);

  const animated = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 10 }],
  }));

  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}

/* -------------------------------------------------------------------- rows */

interface SettingsRowProps {
  label: string;
  /** The right-hand control: a segmented control, toggle, value or chevron. */
  right?: ReactNode;
  onPress?: () => void;
  last?: boolean;
  danger?: boolean;
  delay?: number;
  testID?: string;
}

/** The design's `sRow`: 15px label, space-between, 15px vertical, hairline. */
function SettingsRow({
  label,
  right,
  onPress,
  last = false,
  danger = false,
  delay = 0,
  testID,
}: SettingsRowProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <FadeUp delay={delay}>
      <AppPressable
        variant={onPress ? 'row' : 'none'}
        disabled={!onPress}
        onPress={onPress}
        testID={testID}
        accessibilityRole={onPress ? 'button' : undefined}
        // Only a row that *does* something gets a label of its own; otherwise
        // it would shadow the control it contains (the toggle's own label).
        accessibilityLabel={onPress ? label : undefined}
        style={[styles.row, !last && styles.rowHairline]}
      >
        <Text style={[styles.rowLabel, danger && styles.rowLabelDanger]}>{label}</Text>
        {right}
      </AppPressable>
    </FadeUp>
  );
}

/** The design's `sVal`: 14px muted value plus a disclosure chevron. */
function ValueAccessory({ value, testID }: { value: string; testID?: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.value}>
      <Text style={styles.valueText} testID={testID} numberOfLines={1}>
        {value}
      </Text>
      <ChevronRightIcon />
    </View>
  );
}

/* ------------------------------------------------------------------ picker */

interface PickerOption<T extends string> {
  value: T;
  label: string;
}

/**
 * A full-screen overlay list with a tick on the current choice — the lightest
 * pattern that stays inside the design language (hairline rows, "Back" link,
 * 26/800 title) and needs no new dependency.
 */
function PickerOverlay<T extends string>({
  title,
  options,
  selected,
  onSelect,
  onClose,
  topInset,
}: {
  title: string;
  options: readonly PickerOption<T>[];
  selected: T;
  onSelect: (value: T) => void;
  onClose: () => void;
  topInset: number;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Animated.View
      entering={FadeIn.duration(durations.base)}
      style={[styles.overlay, { paddingTop: topInset }]}
      testID="settings-picker"
    >
      <View style={styles.backRow}>
        <AppPressable
          variant="none"
          accessibilityRole="button"
          accessibilityLabel="Back"
          testID="picker-back"
          onPress={onClose}
          style={styles.backLink}
        >
          <BackChevronIcon />
          <Text style={styles.backText}>Back</Text>
        </AppPressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title} testID="picker-title">
          {title}
        </Text>
        <View style={styles.pickerList}>
          {options.map((option, i) => (
            <AppPressable
              key={option.value}
              variant="row"
              accessibilityRole="button"
              accessibilityState={{ selected: option.value === selected }}
              accessibilityLabel={option.label}
              testID={`picker-option-${option.value}`}
              onPress={() => onSelect(option.value)}
              style={[styles.row, i < options.length - 1 && styles.rowHairline]}
            >
              <Text style={[styles.rowLabel, option.value === selected && styles.rowLabelSelected]}>
                {option.label}
              </Text>
              {option.value === selected ? <CheckIcon /> : null}
            </AppPressable>
          ))}
        </View>
      </ScrollView>
    </Animated.View>
  );
}

/* ----------------------------------------------------------------- confirm */

function ConfirmOverlay({
  title,
  message,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Animated.View
      entering={FadeIn.duration(durations.fast)}
      style={styles.scrim}
      testID="disconnect-confirm"
    >
      <View style={styles.dialog}>
        <Text style={styles.dialogTitle}>{title}</Text>
        <Text style={styles.dialogBody}>{message}</Text>
        <View style={styles.dialogActions}>
          <AppPressable
            variant="button"
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            testID="disconnect-cancel"
            disabled={busy}
            onPress={onCancel}
            style={styles.dialogButton}
          >
            <Text style={styles.dialogCancel}>Cancel</Text>
          </AppPressable>
          <AppPressable
            variant="button"
            accessibilityRole="button"
            accessibilityLabel={confirmLabel}
            testID="disconnect-confirm-button"
            disabled={busy}
            onPress={onConfirm}
            style={styles.dialogButton}
          >
            <Text style={styles.dialogDanger}>{busy ? 'Disconnecting…' : confirmLabel}</Text>
          </AppPressable>
        </View>
      </View>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ screen */

type PickerKind = 'region' | 'defaultView' | 'feedLayout';

export default function SettingsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();

  const serverUrl = useSettings((s) => s.serverUrl);
  const weekStart = useSettings((s) => s.weekStart);
  const timeFormat = useSettings((s) => s.timeFormat);
  const tzMode = useSettings((s) => s.tzMode);
  const timeZone = useSettings((s) => s.timeZone);
  const defaultView = useSettings((s) => s.defaultView);
  const feedLayout = useSettings((s) => s.feedLayout);
  const theme = useSettings((s) => s.theme);
  const autoSuggest = useSettings((s) => s.autoSuggest);
  const smartNotifs = useSettings((s) => s.smartNotifs);

  const setWeekStart = useSettings((s) => s.setWeekStart);
  const setTimeFormat = useSettings((s) => s.setTimeFormat);
  const setTzMode = useSettings((s) => s.setTzMode);
  const setTimeZone = useSettings((s) => s.setTimeZone);
  const setDefaultView = useSettings((s) => s.setDefaultView);
  const setFeedLayout = useSettings((s) => s.setFeedLayout);
  const setTheme = useSettings((s) => s.setTheme);
  const setAutoSuggest = useSettings((s) => s.setAutoSuggest);
  const setSmartNotifs = useSettings((s) => s.setSmartNotifs);

  const lastSyncAt = useEvents((s) => s.lastSyncAt);

  const [picker, setPicker] = useState<PickerKind | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [cacheSize, setCacheSize] = useState<string | null>(null);
  const [allPlugins, setAllPlugins] = useState<PluginMeta[]>([]);

  /* ------------------------------------------------------------ cache size */

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const [eventsRaw, pluginsRaw] = await Promise.all([
          AsyncStorage.getItem(EVENTS_CACHE_KEY),
          AsyncStorage.getItem(PLUGIN_SPEC_CACHE_KEY),
        ]);
        const bytes = [eventsRaw, pluginsRaw].reduce(
          (total, raw) => total + (raw ? utf8ByteLength(raw) : 0),
          0,
        );
        if (mounted.current) setCacheSize(formatByteSize(bytes));
      } catch {
        if (mounted.current) setCacheSize('—');
      }
    })();
    // Re-measure after a sync: the row is only honest if it tracks the data.
  }, [lastSyncAt]);

  /* ------------------------------------------------------------- plugins */

  useEffect(() => {
    let alive = true;
    listPlugins().then((metas) => {
      if (alive) setAllPlugins(metas);
    });
    return () => {
      alive = false;
    };
  }, []);

  /* ------------------------------------------------------------ disconnect */

  const disconnect = useCallback(async () => {
    setDisconnecting(true);
    try {
      // Revoke the key server-side first, while the key still works. A dead
      // server must not trap the user, so a failure here is not fatal.
      await logout();
    } catch {
      // Ignored on purpose; the local teardown below still runs.
    }
    await clearLocalSessionData();
    // The shared teardown clears `onboarded`, half of the root stack guard.
    router.replace('/onboarding');
  }, []);

  /* ---------------------------------------------------------------- render */

  return (
    // `slideIn 0.25s cubic-bezier(.22,1,.36,1)` — the design animated the push
    // by hand; here it rides on top of whatever the stack does, so the screen
    // enters the same way on every platform including web.
    <Animated.View
      entering={SlideInRight.duration(durations.page).easing(Easing.bezier(...easing.standard))}
      style={[styles.root, { paddingTop: insets.top }]}
      testID="settings-screen"
    >
      <View style={styles.backRow}>
        <AppPressable
          variant="none"
          accessibilityRole="button"
          accessibilityLabel="Back"
          testID="settings-back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          style={styles.backLink}
        >
          <BackChevronIcon />
          <Text style={styles.backText}>Back</Text>
        </AppPressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} testID="settings-scroll">
        <FadeUp>
          <Text style={styles.title} testID="settings-title">
            Settings
          </Text>
        </FadeUp>

        {/* ------------------------------------------------------- server -- */}
        <FadeUp>
          <SectionLabel style={styles.section}>Server</SectionLabel>
        </FadeUp>
        <SettingsRow
          label="Address"
          testID="row-address"
          last
          right={
            <Text style={styles.mono} testID="settings-server-url" numberOfLines={1}>
              {serverUrl ?? 'Not connected'}
            </Text>
          }
        />

        {/* ------------------------------------------------------ display -- */}
        <FadeUp delay={STAGGER_MS}>
          <SectionLabel style={styles.section}>Display</SectionLabel>
        </FadeUp>
        <SettingsRow
          label="Start week on"
          delay={STAGGER_MS}
          testID="row-week-start"
          right={
            <SegmentedControl<WeekStart>
              options={['Mon', 'Sun']}
              value={weekStart}
              optionWidth={SEG_WIDTH}
              onChange={setWeekStart}
              accessibilityLabel="Start week on"
            />
          }
        />
        <SettingsRow
          label="Theme"
          delay={STAGGER_MS * 2}
          testID="row-theme"
          right={
            <SegmentedControl<ThemePreference>
              options={['light', 'dark', 'system']}
              value={theme}
              labelFor={(v) => v.charAt(0).toUpperCase() + v.slice(1)}
              optionWidth={SEG_WIDTH_TZ}
              onChange={setTheme}
              accessibilityLabel="Theme"
            />
          }
        />
        <SettingsRow
          label="Time format"
          delay={STAGGER_MS * 2}
          testID="row-time-format"
          right={
            <SegmentedControl<TimeFormat>
              options={['24h', '12h']}
              value={timeFormat}
              optionWidth={SEG_WIDTH}
              onChange={setTimeFormat}
              accessibilityLabel="Time format"
            />
          }
        />
        <SettingsRow
          label="Time zone"
          delay={STAGGER_MS * 3}
          testID="row-tz-mode"
          right={
            <SegmentedControl<TzMode>
              options={['Auto', 'Manual']}
              value={tzMode}
              optionWidth={SEG_WIDTH_TZ}
              onChange={setTzMode}
              accessibilityLabel="Time zone mode"
            />
          }
        />
        {tzMode === 'Manual' ? (
          <SettingsRow
            label="Region"
            delay={STAGGER_MS * 4}
            testID="row-region"
            onPress={() => setPicker('region')}
            right={<ValueAccessory value={timeZone} testID="settings-region-value" />}
          />
        ) : null}
        <SettingsRow
          label="Default view"
          delay={STAGGER_MS * 5}
          testID="row-default-view"
          onPress={() => setPicker('defaultView')}
          right={
            <ValueAccessory value={VIEW_LABELS[defaultView]} testID="settings-default-view-value" />
          }
        />
        <SettingsRow
          label="Feed layout"
          delay={STAGGER_MS * 6}
          testID="row-feed-layout"
          last
          onPress={() => setPicker('feedLayout')}
          right={
            <ValueAccessory value={LAYOUT_LABELS[feedLayout]} testID="settings-feed-layout-value" />
          }
        />

        {/* -------------------------------------------------------- agent -- */}
        <FadeUp delay={STAGGER_MS * 7}>
          <SectionLabel style={styles.section}>Agent</SectionLabel>
        </FadeUp>
        <SettingsRow
          label="Auto-suggestions"
          delay={STAGGER_MS * 7}
          testID="row-auto-suggest"
          right={
            <Toggle
              value={autoSuggest}
              onValueChange={setAutoSuggest}
              accessibilityLabel="Auto-suggestions"
            />
          }
        />
        <SettingsRow
          label="Smart notifications"
          delay={STAGGER_MS * 8}
          testID="row-smart-notifs"
          last
          right={
            <Toggle
              value={smartNotifs}
              onValueChange={setSmartNotifs}
              accessibilityLabel="Smart notifications"
            />
          }
        />

        {/* ------------------------------------------------------ plugins -- */}
        <FadeUp delay={STAGGER_MS * 9}>
          <SectionLabel style={styles.section}>Plugins</SectionLabel>
        </FadeUp>
        <PluginPicker plugins={allPlugins} />

        {/* --------------------------------------------------------- data -- */}
        <FadeUp delay={STAGGER_MS * 9}>
          <SectionLabel style={styles.section}>Data</SectionLabel>
        </FadeUp>
        <SettingsRow
          label="Local cache"
          delay={STAGGER_MS * 9}
          testID="row-local-cache"
          right={
            <Text style={styles.valueText} testID="settings-cache-size">
              {cacheSize ?? '…'}
            </Text>
          }
        />
        <SettingsRow
          label="Disconnect server"
          delay={STAGGER_MS * 10}
          testID="row-disconnect"
          danger
          last
          onPress={() => setConfirming(true)}
          right={<ChevronRightIcon />}
        />
      </ScrollView>

      {picker === 'region' ? (
        <PickerOverlay
          title="Region"
          topInset={insets.top}
          options={zoneOptions(timeZone).map((zone) => ({
            value: zone,
            label: zone.replace(/_/g, ' '),
          }))}
          selected={timeZone}
          onSelect={(zone) => {
            setTimeZone(zone);
            setPicker(null);
          }}
          onClose={() => setPicker(null)}
        />
      ) : null}

      {picker === 'defaultView' ? (
        <PickerOverlay
          title="Default view"
          topInset={insets.top}
          options={DEFAULT_VIEWS.map((view) => ({ value: view, label: VIEW_LABELS[view] }))}
          selected={defaultView}
          onSelect={(view) => {
            setDefaultView(view);
            setPicker(null);
          }}
          onClose={() => setPicker(null)}
        />
      ) : null}

      {picker === 'feedLayout' ? (
        <PickerOverlay
          title="Feed layout"
          topInset={insets.top}
          options={FEED_LAYOUTS.map((l) => ({ value: l, label: LAYOUT_LABELS[l] }))}
          selected={feedLayout}
          onSelect={(l) => {
            setFeedLayout(l);
            setPicker(null);
          }}
          onClose={() => setPicker(null)}
        />
      ) : null}

      {confirming ? (
        <ConfirmOverlay
          title="Disconnect server?"
          message="This revokes this device's API key and clears the local cache. You'll need a new pairing PIN to reconnect."
          confirmLabel="Disconnect"
          busy={disconnecting}
          onConfirm={() => void disconnect()}
          onCancel={() => setConfirming(false)}
        />
      ) : null}
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ styles */

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    root: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  // design: `padding: 14px 24px 0`
  backRow: {
    paddingTop: 14,
    paddingHorizontal: layout.gutter,
  },
  backLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
  },
  backText: {
    fontSize: 14,
    fontFamily: fonts.medium,
    color: colors.muted,
  },
  // design: `padding: 10px 24px 30px`
  content: {
    paddingTop: 10,
    paddingHorizontal: layout.gutter,
    paddingBottom: 30,
  },
  title: {
    ...type.screenTitle,
    color: colors.ink,
    lineHeight: 29,
  },
  // design: `padding: 28px 0 2px`
  section: {
    paddingTop: 28,
    paddingBottom: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 15,
    borderRadius: radii.row,
  },
  rowHairline: {
    borderBottomWidth: layout.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
  rowLabel: {
    ...type.rowLabel,
    color: colors.ink,
    flexShrink: 1,
  },
  rowLabelDanger: {
    fontFamily: fonts.semibold,
    color: colors.red,
  },
  rowLabelSelected: {
    fontFamily: fonts.semibold,
  },
  value: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexShrink: 1,
  },
  valueText: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: colors.muted,
  },
  mono: {
    fontSize: 13,
    color: colors.ink,
    flexShrink: 1,
    fontFamily: MONO,
  },

  /* -------------------------------------------------------------- picker */
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colors.canvas,
    zIndex: 20,
  },
  pickerList: {
    paddingTop: 12,
  },

  /* ------------------------------------------------------------- confirm */
  scrim: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(15,15,15,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    zIndex: 30,
  },
  dialog: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: colors.canvas,
    borderRadius: 16,
    padding: 22,
  },
  dialogTitle: {
    fontSize: 17,
    fontFamily: fonts.bold,
    color: colors.ink,
    letterSpacing: -0.3,
  },
  dialogBody: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 20,
    fontFamily: fonts.regular,
    color: colors.body,
  },
  dialogActions: {
    marginTop: 20,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  dialogButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radii.row,
  },
  dialogCancel: {
    fontSize: 14,
    fontFamily: fonts.semibold,
    color: colors.muted,
  },
  dialogDanger: {
    fontSize: 14,
    fontFamily: fonts.semibold,
    color: colors.red,
  },
});
