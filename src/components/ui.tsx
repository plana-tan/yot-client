import type { ReactNode } from 'react';
import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import AppPressable from '@/components/AppPressable';
import { colors, fonts, radii, type } from '@/theme/tokens';

/**
 * A small shadcn-style UI kit built on the app's design tokens. These are
 * general-purpose primitives (usable outside plugins too); the plugin catalog
 * registers thin adapters over them so JSON specs can reference them by name.
 */

/* -------------------------------------------------------------------- Card */

export function Card({
  children,
  style,
}: {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function CardHeader({
  children,
  style,
}: {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.cardHeader, style]}>{children}</View>;
}

export function CardTitle({
  children,
  style,
}: {
  children?: ReactNode;
  style?: StyleProp<TextStyle>;
}) {
  return (
    <Text style={[styles.cardTitle, style]} numberOfLines={1}>
      {children}
    </Text>
  );
}

export function CardContent({
  children,
  style,
}: {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.cardContent, style]}>{children}</View>;
}

/* ------------------------------------------------------------------- Badge */

export type BadgeVariant = 'default' | 'secondary' | 'outline' | 'destructive' | 'success';

export function Badge({
  children,
  variant = 'default',
  style,
}: {
  children?: ReactNode;
  variant?: BadgeVariant;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.badge, badgeVariant[variant], style]}>
      <Text style={[styles.badgeText, badgeTextVariant[variant]]}>{children}</Text>
    </View>
  );
}

/* ------------------------------------------------------------------ Button */

export type ButtonVariant = 'default' | 'secondary' | 'ghost' | 'outline' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg';

export function Button({
  children,
  variant = 'default',
  size = 'md',
  onPress,
  disabled,
  style,
}: {
  children?: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <AppPressable
      variant="button"
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={[
        styles.button,
        buttonSize[size],
        buttonVariant[variant],
        disabled && styles.buttonDisabled,
        style,
      ]}
    >
      <Text style={[styles.buttonText, buttonTextVariant[variant]]}>{children}</Text>
    </AppPressable>
  );
}

/* ---------------------------------------------------------------- Progress */

/** `value` is 0..1, matching the plugin derive `progress`. */
export function Progress({
  value = 0,
  color = colors.ink,
  style,
}: {
  value?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <View style={[styles.progressTrack, style]}>
      <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: color }]} />
    </View>
  );
}

/* --------------------------------------------------------------- Separator */

export function Separator({
  color = colors.hairline,
  style,
}: {
  color?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[{ height: 1, backgroundColor: color, marginVertical: 12 }, style]} />;
}

/* ------------------------------------------------------------------ styles */

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.canvas,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
    overflow: 'hidden',
  },
  cardHeader: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cardTitle: {
    ...type.rowTitle,
    color: colors.ink,
  },
  cardContent: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    gap: 6,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  badgeText: {
    fontSize: 12,
    fontFamily: fonts.semibold,
  },
  button: {
    paddingHorizontal: 16,
    borderRadius: radii.field,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  buttonText: {
    fontFamily: fonts.semibold,
    fontSize: 14,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.hairlineStrong,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
});

const badgeVariant: Record<BadgeVariant, ViewStyle> = {
  default: { backgroundColor: colors.blue },
  secondary: { backgroundColor: colors.hairline },
  outline: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.hairlineStrong },
  destructive: { backgroundColor: colors.red },
  success: { backgroundColor: colors.green },
};

const badgeTextVariant: Record<BadgeVariant, TextStyle> = {
  default: { color: '#FFFFFF' },
  secondary: { color: colors.ink },
  outline: { color: colors.ink },
  destructive: { color: '#FFFFFF' },
  success: { color: '#FFFFFF' },
};

const buttonVariant: Record<ButtonVariant, ViewStyle> = {
  default: { backgroundColor: colors.ink },
  secondary: { backgroundColor: colors.hairline },
  ghost: { backgroundColor: 'transparent' },
  outline: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.hairlineStrong },
  destructive: { backgroundColor: colors.red },
};

const buttonTextVariant: Record<ButtonVariant, TextStyle> = {
  default: { color: '#FFFFFF' },
  secondary: { color: colors.ink },
  ghost: { color: colors.ink },
  outline: { color: colors.ink },
  destructive: { color: '#FFFFFF' },
};

const buttonSize: Record<ButtonSize, ViewStyle> = {
  sm: { paddingVertical: 6, minHeight: 32 },
  md: { paddingVertical: 10, minHeight: 40 },
  lg: { paddingVertical: 14, minHeight: 48 },
};
