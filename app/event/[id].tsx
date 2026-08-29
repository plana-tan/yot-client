import { addMinutes, differenceInMinutes, format } from 'date-fns';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { Easing, FadeIn, SlideInRight } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AppPressable from '@/components/AppPressable';
import DateTimeField from '@/components/DateTimeField';
import TextField from '@/components/TextField';
import { BackChevronIcon } from '@/components/icons';
import { getEvent } from '@/api/client';
import { toAppEvent, type AppEvent } from '@/api/types';
import { fmtTimeRange } from '@/lib/dates';
import { useEvents } from '@/store/events';
import { useEffectiveTimeZone, useTimeFormat } from '@/store/settings';
import { useTheme } from '@/theme/context';
import { durations, easing, fonts, radii, type } from '@/theme/tokens';
import type { Colors } from '@/theme/tokens';

/**
 * Event detail (design lines 1007-1049) with the edit sheet (1051-1106).
 *
 * Deviations, both sanctioned by the plan:
 *  - the metadata block drops the prototype's **Source** row (Yot has no
 *    source field) and shows **Calendar / Location / Duration** instead;
 *  - the edit sheet's three free-text fields become a real date picker and two
 *    time pickers.
 *
 * The edit sheet is an in-page overlay rather than a router modal: that is the
 * design's own structure (`zIndex: 110` over the detail page), it keeps the
 * unsaved draft next to the record it edits, and it needs no route wiring.
 */

/* -------------------------------------------------------------- metadata */

function MetaRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={[styles.metaRow, !last && styles.metaHairline]}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

/* -------------------------------------------------------------- back link */

function BackLink({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <AppPressable
      variant="none"
      accessibilityRole="button"
      accessibilityLabel="Back"
      testID="event-back"
      onPress={onPress}
      style={styles.backLink}
    >
      <BackChevronIcon />
      <Text style={styles.link}>Back</Text>
    </AppPressable>
  );
}

/* ----------------------------------------------------------------- screen */

export default function EventDetailScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const timeFormat = useTimeFormat();
  const timeZone = useEffectiveTimeZone();

  const stored = useEvents((s) => (id ? s.eventsById[id] : undefined));
  // Events outside the synced window (±horizon months) — e.g. plugin items
  // opened from the feed — are not in the store; fetch the single record.
  const [fetched, setFetched] = useState<AppEvent | null>(null);
  const [fetchFailed, setFetchFailed] = useState(false);
  useEffect(() => {
    setFetched(null);
    setFetchFailed(false);
    if (!id || stored) return;
    let alive = true;
    getEvent(id)
      .then((wire) => {
        if (alive) setFetched(toAppEvent(wire));
      })
      .catch(() => {
        if (alive) setFetchFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [id, stored]);
  const event = stored ?? fetched;
  const calendar = useEvents((s) => (event ? s.calendarsById[event.calendarId] : undefined));
  const editEvent = useEvents((s) => s.editEvent);
  const removeEvent = useEvents((s) => s.removeEvent);

  const [editing, setEditing] = useState(false);

  const back = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/events');
  }, []);

  if (!event) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]} testID="event-detail-missing">
        <View style={styles.header}>
          <View style={styles.topBar}>
            <BackLink onPress={back} />
          </View>
        </View>
        <View style={styles.missing}>
          <Text style={styles.missingTitle}>Event not found</Text>
          <Text style={styles.missingBody}>
            {fetchFailed
              ? 'It may have been deleted, or it is outside the synced range.'
              : 'Loading…'}
          </Text>
        </View>
      </View>
    );
  }

  const subtitle = `${format(event.start, 'EEEE, MMMM d')} · ${fmtTimeRange(
    event.start,
    event.end,
    timeFormat,
    undefined,
    timeZone,
  )}`;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="event-detail">
      <View style={styles.header}>
        <View style={styles.topBar}>
          <BackLink onPress={back} />
          <AppPressable
            variant="none"
            accessibilityRole="button"
            testID="event-edit"
            onPress={() => setEditing(true)}
          >
            <Text style={styles.link}>Edit</Text>
          </AppPressable>
        </View>

        <Text style={styles.title} testID="event-title">
          {event.title}
        </Text>
        <Text style={styles.subtitle} testID="event-subtitle">
          {subtitle}
        </Text>
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        {event.description ? (
          <Text style={styles.description} testID="event-description">
            {event.description}
          </Text>
        ) : null}

        <View style={styles.meta}>
          <MetaRow label="Calendar" value={calendar?.name ?? 'Calendar'} />
          {event.location ? <MetaRow label="Location" value={event.location} /> : null}
          <MetaRow label="Duration" value={fmtTimeRange(event.start, event.end, timeFormat, undefined, timeZone)} last />
        </View>
      </ScrollView>

      {editing ? (
        <EditSheet
          key={event.id}
          initial={{
            title: event.title,
            start: event.start,
            end: event.end,
            description: event.description ?? '',
          }}
          timeFormat={timeFormat}
          topInset={insets.top}
          onCancel={() => setEditing(false)}
          onSave={(draft) => {
            setEditing(false);
            void editEvent(event.id, {
              title: draft.title,
              start: draft.start,
              end: draft.end,
              description: draft.description.trim() === '' ? null : draft.description,
            });
          }}
          onDelete={() => {
            setEditing(false);
            void removeEvent(event.id).then(back);
          }}
        />
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------- edit sheet */

interface Draft {
  title: string;
  start: Date;
  end: Date;
  description: string;
}

interface EditSheetProps {
  initial: Draft;
  timeFormat: '12h' | '24h';
  topInset: number;
  onCancel: () => void;
  onSave: (draft: Draft) => void;
  onDelete: () => void;
}

/** Native gets a real dialog; the web build has `window.confirm`. */
function confirmDelete(onConfirm: () => void): void {
  if (Platform.OS === 'web') {
    if (typeof confirm !== 'function' || confirm('Delete this event?')) onConfirm();
    return;
  }
  Alert.alert('Delete event?', 'This cannot be undone.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: onConfirm },
  ]);
}

function EditSheet({ initial, timeFormat, topInset, onCancel, onSave, onDelete }: EditSheetProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [title, setTitle] = useState(initial.title);
  const [start, setStart] = useState(initial.start);
  const [end, setEnd] = useState(initial.end);
  const [description, setDescription] = useState(initial.description);

  /**
   * The draft's *current* length, preserved when the day moves. Deriving this
   * from `initial` instead would silently undo an edited end time: stretch
   * 1h→2h, then correct the date, and the event snapped back to 1h.
   */
  const span = Math.max(1, differenceInMinutes(end, start));

  const invalid = end.getTime() <= start.getTime();

  return (
    <Animated.View
      testID="event-edit-sheet"
      style={[styles.sheet, { paddingTop: topInset }]}
      entering={SlideInRight.duration(durations.page).easing(Easing.bezier(...easing.standard))}
    >
      <View style={styles.sheetHeader}>
        <AppPressable
          variant="none"
          accessibilityRole="button"
          testID="edit-cancel"
          onPress={onCancel}
        >
          <Text style={styles.cancel}>Cancel</Text>
        </AppPressable>
        <Text style={styles.sheetTitle}>Edit Event</Text>
        <AppPressable
          variant="none"
          accessibilityRole="button"
          testID="edit-save"
          disabled={invalid}
          onPress={() => onSave({ title, start, end, description })}
        >
          <Text style={[styles.save, invalid && styles.saveDisabled]}>Save</Text>
        </AppPressable>
      </View>

      <KeyboardAvoidingView
        style={styles.sheetBody}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
          <TextField label="Title" value={title} onChangeText={setTitle} testID="edit-title" />

          <DateTimeField
            label="Date"
            mode="date"
            value={start}
            timeFormat={timeFormat}
            testID="edit-date"
            onChange={(next) => {
              setStart(next);
              // Keep the event the same length when only the day changes.
              setEnd(addMinutes(next, span));
            }}
          />

          <View style={styles.timeRow}>
            <DateTimeField
              label="Start"
              mode="time"
              value={start}
              timeFormat={timeFormat}
              style={styles.timeField}
              testID="edit-start"
              onChange={(next) => {
                setStart(next);
                // Clamp rather than reject: dragging the start past the end is
                // an ordinary thing to do, and the event keeps its length.
                if (end.getTime() <= next.getTime()) setEnd(addMinutes(next, span));
              }}
            />
            <DateTimeField
              label="End"
              mode="time"
              value={end}
              timeFormat={timeFormat}
              style={styles.timeField}
              testID="edit-end"
              onChange={setEnd}
            />
          </View>

          {invalid ? (
            <Animated.Text entering={FadeIn} style={styles.error} testID="edit-error">
              End time must be after the start time.
            </Animated.Text>
          ) : null}

          <TextField
            label="Description"
            value={description}
            onChangeText={setDescription}
            multiline
            rows={4}
            testID="edit-description"
          />

          <AppPressable
            variant="button"
            accessibilityRole="button"
            testID="edit-delete"
            onPress={() => confirmDelete(onDelete)}
            style={styles.delete}
          >
            <Text style={styles.deleteLabel}>Delete Event</Text>
          </AppPressable>
        </ScrollView>
      </KeyboardAvoidingView>
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
  header: {
    // design: `padding: 14px 24px 0`
    paddingTop: 14,
    paddingHorizontal: 24,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  backLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  link: {
    fontSize: 14,
    fontFamily: fonts.medium,
    color: colors.muted,
  },
  title: {
    ...type.detailTitle,
    color: colors.ink,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: colors.muted,
    marginBottom: 24,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  description: {
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
    alignItems: 'flex-start',
    gap: 24,
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
    flexShrink: 1,
    textAlign: 'right',
    fontSize: 13,
    fontFamily: fonts.semibold,
    color: colors.ink,
  },

  missing: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 8,
  },
  missingTitle: {
    ...type.screenTitle,
    color: colors.ink,
    textAlign: 'center',
  },
  missingBody: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: colors.muted,
    textAlign: 'center',
  },

  /* ---------------------------------------------------------- edit sheet */

  sheet: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.canvas,
    zIndex: 110,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 14,
    paddingHorizontal: 24,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairlineStrong,
  },
  sheetTitle: {
    fontSize: 16,
    fontFamily: fonts.extrabold,
    color: colors.ink,
    letterSpacing: -0.5,
  },
  cancel: {
    fontSize: 14,
    fontFamily: fonts.semibold,
    color: colors.muted,
  },
  save: {
    fontSize: 14,
    fontFamily: fonts.bold,
    color: colors.blue,
  },
  saveDisabled: {
    color: colors.faint,
  },
  sheetBody: {
    flex: 1,
  },
  sheetContent: {
    paddingTop: 20,
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  timeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  timeField: {
    flex: 1,
  },
  error: {
    fontSize: 12,
    fontFamily: fonts.medium,
    color: colors.red,
    marginTop: -8,
    marginBottom: 14,
  },
  delete: {
    marginTop: 12,
    paddingVertical: 13,
    borderRadius: radii.field,
    borderWidth: 1,
    // design line 1104 — a warm, desaturated red border, used nowhere else.
    borderColor: '#F0E0DE',
    alignItems: 'center',
  },
  deleteLabel: {
    fontSize: 13,
    fontFamily: fonts.semibold,
    color: colors.red,
  },
});
