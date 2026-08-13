import { Text, View } from 'react-native';

import { PlaneIcon } from '@/components/icons';
import { colors, fonts } from '@/theme/tokens';

/** Status label → pill tint for flight-style plugins. */
const STATUS_TINTS: Record<string, string> = {
  'On time': '#2F9E63',
  Boarding: '#2F9E63',
  Delayed: '#E8A13A',
  Cancelled: '#E8453C',
  Scheduled: '#6B7280',
  Landed: '#4361EE',
};

export interface ElementProps {
  value?: string;
  props?: Record<string, unknown>;
  children?: React.ReactNode;
  onPress?: () => void;
  color?: string;
}

export type CatalogEntry = (p: ElementProps) => React.ReactElement;

/**
 * The host's registry of renderable components. Keys are the `type` strings a
 * spec may reference. Props are FIXED and typed — no arbitrary style injection.
 */
export const catalog: Record<string, CatalogEntry> = {
  Row: ({ props, children }) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: (props?.gap as number) ?? 14, flex: (props?.flex as number) ?? 1 }}>{children}</View>
  ),
  Column: ({ children }) => <View style={{ flex: 1, minWidth: 0 }}>{children}</View>,
  Scroll: ({ children }) => <View>{children}</View>,
  Spacer: ({ props }) => <View style={{ height: (props?.size as number) ?? 8, flex: (props?.flex as number) ?? 0 }} />,
  Divider: () => <View style={{ height: 1, backgroundColor: colors.hairline }} />,
  Title: ({ value }) => <Text style={{ fontSize: 15, fontFamily: fonts.semibold, color: colors.ink }} numberOfLines={1}>{value}</Text>,
  Subtitle: ({ value }) => <Text style={{ fontSize: 12, fontFamily: fonts.regular, color: colors.muted, marginTop: 3 }} numberOfLines={1}>{value}</Text>,
  Text: ({ value }) => <Text style={{ fontSize: 15, fontFamily: fonts.regular, color: colors.body }}>{value}</Text>,
  TimeLabel: ({ value }) => <Text style={{ fontSize: 12, fontFamily: fonts.medium, color: colors.muted }}>{value}</Text>,
  Badge: ({ value }) => (
    <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: colors.hairline }}>
      <Text style={{ fontSize: 11, fontFamily: fonts.semibold, color: colors.ink }}>{value}</Text>
    </View>
  ),
  ProgressBar: ({ props, color }) => {
    const pct = Math.round(Math.min(1, Math.max(0, ((props?.progress as number) ?? 0))) * 100);
    const flex = (props?.flex as number) ?? 0;
    const height = (props?.height as number) ?? 3;
    const marginTop = (props?.marginTop as number) ?? 6;
    return (
      <View style={{ width: flex ? undefined : 80, flex, height, borderRadius: height / 2, backgroundColor: colors.hairlineStrong, overflow: 'hidden', marginTop }}>
        <View style={{ height: '100%', width: `${pct}%`, backgroundColor: (color as string) ?? colors.ink }} />
      </View>
    );
  },
  Route: ({ props, color }) => {
    const origin = String(props?.origin ?? '');
    const destination = String(props?.destination ?? '');
    const progress = Math.min(1, Math.max(0, Number(props?.progress) || 0));
    const accent = (color as string) ?? colors.ink;
    return (
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Text style={{ fontSize: 17, fontFamily: fonts.bold, color: colors.ink }}>{origin}</Text>
        <View style={{ flex: 1, height: 2, backgroundColor: colors.hairlineStrong, borderRadius: 1 }}>
          <View style={{ height: '100%', width: `${progress * 100}%`, backgroundColor: accent, borderRadius: 1 }} />
          <View style={{ position: 'absolute', left: `${progress * 100}%`, top: -7, marginLeft: -8 }}>
            <PlaneIcon size={16} color={accent} strokeWidth={1.8} />
          </View>
        </View>
        <Text style={{ fontSize: 17, fontFamily: fonts.bold, color: colors.ink }}>{destination}</Text>
      </View>
    );
  },
  StatusBadge: ({ value }) => {
    const tint = STATUS_TINTS[String(value ?? '')] ?? colors.muted;
    return (
      <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: tint }}>
        <Text style={{ fontSize: 11, fontFamily: fonts.semibold, color: '#FFFFFF' }}>{value}</Text>
      </View>
    );
  },
  Checkbox: ({ props }) => {
    const checked = Boolean(props?.checked);
    return (
      <View style={{ width: 18, height: 18, borderRadius: 5, borderWidth: 1.5, borderColor: colors.muted, backgroundColor: checked ? colors.ink : 'transparent' }} />
    );
  },
};

export function resolveComponent(type: string): CatalogEntry {
  const c = catalog[type];
  if (!c) throw new Error(`Unknown catalog component: ${type}`);
  return c;
}
