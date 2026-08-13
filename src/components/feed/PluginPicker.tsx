import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import AppPressable from '@/components/AppPressable';
import { CheckIcon } from '@/components/icons';
import { BUILTIN_SEGMENTS } from '@/plugins/builtins';
import type { PluginMeta } from '@/plugins/schema';
import { usePlugins } from '@/store/plugins';
import { colors, fonts, springs } from '@/theme/tokens';

/**
 * A list of toggleable feed segments: the built-ins (Ask, …) first, then the
 * real plugins. The "Add" button morphs into a checkmark (scale + spring) when
 * a segment is on; the row stays in place rather than disappearing. Used by
 * Settings and onboarding.
 */
export interface PluginPickerProps {
  plugins: PluginMeta[];
}

export default function PluginPicker({ plugins }: PluginPickerProps) {
  const hiddenBuiltIns = usePlugins((s) => s.hiddenBuiltIns);
  const toggleBuiltIn = usePlugins((s) => s.toggleBuiltIn);
  const added = usePlugins((s) => s.added);
  const toggle = usePlugins((s) => s.toggle);

  return (
    <View style={styles.list}>
      {BUILTIN_SEGMENTS.map((b) => (
        <Row
          key={b.id}
          id={b.id}
          title={b.title}
          description={b.description}
          added={!hiddenBuiltIns.includes(b.id)}
          onPress={() => toggleBuiltIn(b.id)}
        />
      ))}
      {plugins.map((p) => (
        <Row
          key={p.id}
          id={p.id}
          title={p.title}
          description={p.description}
          added={added.some((a) => a.id === p.id)}
          onPress={() => toggle(p)}
        />
      ))}
    </View>
  );
}

function Row({
  id,
  title,
  description,
  added,
  onPress,
}: {
  id: string;
  title: string;
  description?: string;
  added: boolean;
  onPress: () => void;
}) {
  return (
    <View style={styles.row} testID={`plugin-picker-${id}`}>
      <View style={styles.rowText}>
        <Text style={styles.title}>{title}</Text>
        {description ? <Text style={styles.desc}>{description}</Text> : null}
      </View>
      <AddButton id={id} added={added} label={title} onPress={onPress} />
    </View>
  );
}

function AddButton({
  id,
  added,
  label,
  onPress,
}: {
  id: string;
  added: boolean;
  label: string;
  onPress: () => void;
}) {
  const scale = useSharedValue(added ? 1 : 0);

  useEffect(() => {
    scale.value = withSpring(added ? 1 : 0, springs.bouncy);
  }, [added, scale]);

  const checkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: scale.value,
  }));

  return (
    <AppPressable
      variant="button"
      accessibilityRole="button"
      accessibilityState={{ selected: added }}
      accessibilityLabel={added ? `Remove ${label}` : `Add ${label}`}
      testID={`plugin-add-${id}`}
      onPress={onPress}
      style={[styles.addButton, added && styles.addButtonAdded]}
    >
      {added ? (
        <Animated.View style={checkStyle}>
          <CheckIcon size={16} color="#fff" strokeWidth={2.5} />
        </Animated.View>
      ) : (
        <Text style={styles.addLabel}>Add</Text>
      )}
    </AppPressable>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 15,
    fontFamily: fonts.semibold,
    color: colors.ink,
  },
  desc: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: colors.muted,
  },
  addButton: {
    width: 64,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.ink,
  },
  addButtonAdded: {
    backgroundColor: colors.green,
  },
  addLabel: {
    fontSize: 13,
    fontFamily: fonts.semibold,
    color: colors.canvas,
  },
});
