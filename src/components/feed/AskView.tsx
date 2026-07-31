import { useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { askStream, listAskModels } from '@/api/client';
import type { AppEvent } from '@/api/types';
import AppPressable from '@/components/AppPressable';
import { SendIcon } from '@/components/icons';
import { fmtClock, type TimeFormat } from '@/lib/dates';
import { answer, buildInsight, type AskAction } from '@/lib/askEngine';
import { colors, fonts, radii } from '@/theme/tokens';

/**
 * The Ask pane (design lines 761-816).
 *
 * The engine is `lib/askEngine` — pure keyword routing over the user's own
 * events, no model. This file owns the theatre the design specified: a think
 * pause, three pulsing dots, and the answer arriving word by word.
 *
 * Every timer is cleared on unmount and on a new query, so a fast second
 * question can never interleave with the first one's stream.
 */

/** The design's `setTimeout(400 + Math.random() * 300)` think pause. */
const THINK_MIN_MS = 400;
const THINK_JITTER_MS = 300;
/** Per-word cadence, `30 + Math.random() * 40` in the design. */
const WORD_MIN_MS = 30;
const WORD_JITTER_MS = 40;

interface AskState {
  text: string;
  actions: AskAction[];
  previewEventIds: string[];
}

export interface AskViewProps {
  events: readonly AppEvent[];
  timeFormat: TimeFormat;
  onOpenEvent: (id: string) => void;
}

/* ------------------------------------------------------------------- dots */

/** `dotAppear 0.6s ease infinite alternate` with a 0 / .15 / .3s stagger. */
function LoadingDot({ delay }: { delay: number }) {
  const scale = useSharedValue(0);

  useEffect(() => {
    scale.value = withDelay(delay, withRepeat(withTiming(1, { duration: 600 }), -1, true));
  }, [delay, scale]);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return <Animated.View style={[styles.dot, style]} />;
}

/* ------------------------------------------------------------------- view */

export default function AskView({ events, timeFormat, onOpenEvent }: AskViewProps) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AskState | null>(null);
  const [streamed, setStreamed] = useState('');
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string | undefined>(undefined);
  const [modelPickerOpen, setModelPickerOpen] = useState(false);

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const requestId = useRef(0);
  const clearTimers = () => {
    for (const t of timers.current) clearTimeout(t);
    timers.current = [];
  };
  useEffect(() => clearTimers, []);

  // Fetch available AI models on mount
  useEffect(() => {
    listAskModels()
      .then((res) => {
        setAvailableModels(res.models);
        setSelectedModel(res.default);
      })
      .catch(() => {
        // Silently fail - model selection is optional
      });
  }, []);

  // v15 rotated the ambient insight off the wall clock; one seed per mount
  // keeps it from changing under the user mid-read.
  const seed = useRef(Math.floor(Date.now() / 10_000)).current;
  const insight = useMemo(
    () => buildInsight(events, new Date(), seed),
    [events, seed],
  );

  const eventsById = useMemo(() => {
    const map = new Map<string, AppEvent>();
    for (const event of events) map.set(event.id, event);
    return map;
  }, [events]);

  const stream = (text: string) => {
    const words = text.split(' ');
    let i = 0;
    setStreamed('');
    const tick = () => {
      if (i >= words.length) return;
      i += 1;
      setStreamed(words.slice(0, i).join(' '));
      timers.current.push(
        setTimeout(tick, WORD_MIN_MS + Math.random() * WORD_JITTER_MS),
      );
    };
    tick();
  };

  const send = async () => {
    const q = query.trim();
    if (!q) return;

    clearTimers();
    const thisRequest = ++requestId.current;
    setLoading(true);
    setResult({ text: '', actions: [], previewEventIds: [] });
    setStreamed('');

    try {
      const response = await askStream(q, undefined, selectedModel, (text) => {
        if (thisRequest !== requestId.current) return;
        setLoading(false);
        setStreamed((current) => current + text);
      });
      if (thisRequest !== requestId.current) return;
      setLoading(false);
      const result: AskState = {
        text: response.answer,
        actions: [],
        previewEventIds: [],
      };
      setResult(result);
    } catch (error) {
      if (thisRequest !== requestId.current) return;
      // Fallback to local engine
      const next = answer(q, events, new Date(), { timeFormat });
      setLoading(false);
      const fallbackResult: AskState = {
        text: next.text + '\n\n（offline mode）',
        actions: next.actions,
        previewEventIds: next.previewEventIds,
      };
      setResult(fallbackResult);
      stream(fallbackResult.text);
    }
  };

  const clear = () => {
    clearTimers();
    setLoading(false);
    setResult(null);
    setStreamed('');
    setQuery('');
  };

  const idle = !result && !loading;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      testID="feed-ask"
    >
      {availableModels.length > 1 ? (
        <View style={styles.modelHeader}>
          <TouchableOpacity
            style={styles.modelChip}
            onPress={() => setModelPickerOpen((open) => !open)}
            testID="ask-model-picker"
            accessibilityRole="button"
            accessibilityLabel={`Model: ${selectedModel || 'Select model'}`}
          >
            <Text style={styles.modelChipText} numberOfLines={1}>
              {selectedModel || 'Select model'}
            </Text>
            <Text style={styles.modelChipChevron}>{modelPickerOpen ? '⌃' : '⌄'}</Text>
          </TouchableOpacity>
          {modelPickerOpen ? (
            <View style={styles.modelDropdown}>
              {availableModels.map((model) => (
                <TouchableOpacity
                  key={model}
                  style={[styles.modelOption, model === selectedModel && styles.modelOptionSelected]}
                  onPress={() => {
                    setSelectedModel(model);
                    setModelPickerOpen(false);
                  }}
                  testID={`ask-model-option-${model}`}
                >
                  <Text style={styles.modelOptionText}>{model}</Text>
                  {model === selectedModel ? <Text style={styles.modelCheck}>✓</Text> : null}
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, idle && styles.scrollContentIdle]}
        keyboardShouldPersistTaps="handled"
      >
        {idle ? (
          <View style={styles.insightWrap}>
            <Text style={styles.insight} testID="ask-insight">
              {insight}
            </Text>
          </View>
        ) : null}

        {loading ? (
          <View style={styles.loading} testID="ask-loading">
            <LoadingDot delay={0} />
            <LoadingDot delay={150} />
            <LoadingDot delay={300} />
          </View>
        ) : null}

        {result ? (
          <View style={styles.answer} testID="ask-answer">
            <Text style={styles.answerText} testID="ask-text">
              {streamed || result.text}
            </Text>

            {result.previewEventIds.length > 0 ? (
              <View style={styles.chips}>
                {result.previewEventIds.map((id) => {
                  const event = eventsById.get(id);
                  if (!event) return null;
                  return (
                    <AppPressable
                      key={id}
                      variant="button"
                      accessibilityRole="button"
                      accessibilityLabel={event.title}
                      testID={`ask-chip-${id}`}
                      onPress={() => onOpenEvent(id)}
                      style={styles.chip}
                    >
                      <Text style={styles.chipTime}>{fmtClock(event.start, timeFormat)}</Text>
                      <Text style={styles.chipTitle} numberOfLines={1}>
                        {event.title}
                      </Text>
                    </AppPressable>
                  );
                })}
              </View>
            ) : null}

            {result.actions.length > 0 ? (
              <View style={styles.actions}>
                {result.actions.map((action) => (
                  <AppPressable
                    key={action.label}
                    variant="button"
                    accessibilityRole="button"
                    testID={`ask-action-${action.label}`}
                    // Prototype behaviour: the quick actions are affordances
                    // the design drew but never wired to anything.
                    onPress={() => undefined}
                    style={styles.action}
                  >
                    <Text style={styles.actionLabel}>{action.label}</Text>
                  </AppPressable>
                ))}
              </View>
            ) : null}

            <AppPressable
              variant="none"
              accessibilityRole="button"
              testID="ask-clear"
              onPress={clear}
            >
              <Text style={styles.clear}>Clear</Text>
            </AppPressable>
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.bar}>
        <View style={styles.barInner}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={send}
            returnKeyType="send"
            placeholder="Ask anything…"
            placeholderTextColor={colors.faint}
            style={styles.input}
            accessibilityLabel="Ask anything"
            testID="ask-input"
          />
          {query.trim() ? (
            <AppPressable
              variant="button"
              accessibilityRole="button"
              accessibilityLabel="Send"
              testID="ask-send"
              onPress={send}
              style={styles.send}
            >
              <SendIcon />
            </AppPressable>
          ) : null}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  scrollContentIdle: {
    justifyContent: 'center',
  },

  insightWrap: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  insight: {
    fontSize: 14,
    fontFamily: fonts.medium,
    color: colors.faint,
    textAlign: 'center',
  },

  loading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 24,
    paddingHorizontal: 20,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.chevron,
  },

  answer: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    width: '100%',
  },
  answerText: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: '#333333',
    // design: `line-height: 1.65`
    lineHeight: 23,
    marginBottom: 12,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: 10,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: colors.hairline,
  },
  chipTime: {
    fontSize: 12,
    fontFamily: fonts.medium,
    color: colors.muted,
  },
  chipTitle: {
    fontSize: 12,
    fontFamily: fonts.medium,
    color: colors.body,
    flexShrink: 1,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  action: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    // design line 800 — this border tone appears nowhere else.
    borderColor: '#E0E0DE',
  },
  actionLabel: {
    fontSize: 12,
    fontFamily: fonts.medium,
    color: colors.body,
  },
  clear: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: colors.faint,
  },

  bar: {
    paddingTop: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexShrink: 0,
  },
  barInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.hairline,
    borderRadius: 12,
    paddingTop: 3,
    paddingBottom: 3,
    paddingLeft: 14,
    paddingRight: 5,
  },
  input: {
    flex: 1,
    fontSize: 14,
    fontFamily: fonts.regular,
    color: colors.ink,
    paddingVertical: 8,
  },
  send: {
    width: 28,
    height: 28,
    borderRadius: radii.send,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  modelHeader: {
    zIndex: 2,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 2,
    alignItems: 'flex-start',
  },
  modelChip: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: '88%',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: colors.hairline,
  },
  modelChipText: {
    maxWidth: 220,
    fontSize: 13,
    fontFamily: fonts.medium,
    color: colors.body,
  },
  modelChipChevron: {
    marginLeft: 7,
    fontSize: 15,
    lineHeight: 15,
    color: colors.muted,
  },
  modelDropdown: {
    minWidth: 210,
    marginTop: 6,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  modelOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  modelOptionSelected: {
    backgroundColor: colors.hairline,
  },
  modelOptionText: {
    flex: 1,
    fontSize: 13,
    fontFamily: fonts.regular,
    color: colors.body,
  },
  modelCheck: {
    marginLeft: 10,
    fontSize: 14,
    fontFamily: fonts.medium,
    color: colors.ink,
  },
});
