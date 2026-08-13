import { Text, View } from 'react-native';
import { colors, fonts } from '@/theme/tokens';

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
