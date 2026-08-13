import Svg, { Circle, Path, type SvgProps } from 'react-native-svg';

import { colors } from '@/theme/tokens';

/**
 * Icons transcribed from `project/Calendar App v15.dc.html`. Path data is
 * copied verbatim; only the wrapper API is new.
 */

export interface IconProps extends SvgProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

/* -------------------------------------------------------------- navigation */

/** Settings gear — 19px, `#888`, strokeWidth 1.6 (design line ~126). */
export function GearIcon({
  size = 19,
  color = colors.iconMuted,
  strokeWidth = 1.6,
  ...rest
}: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...rest}>
      <Path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" stroke={color} strokeWidth={strokeWidth} />
      <Path
        d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/**
 * Back chevron beside the "Back" link — 16px, `currentColor`, strokeWidth 1.8.
 * Defaults to `muted` since that is the link colour at rest.
 */
export function BackChevronIcon({
  size = 16,
  color = colors.muted,
  strokeWidth = 1.8,
  ...rest
}: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" fill="none" {...rest}>
      <Path
        d="M10 3L5 8l5 5"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Disclosure chevron at the end of a row — 14px, `#CCC`, strokeWidth 1.5. */
export function ChevronRightIcon({
  size = 14,
  color = colors.chevron,
  strokeWidth = 1.5,
  ...rest
}: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 14 14" fill="none" {...rest}>
      <Path
        d="M5 3l4 4-4 4"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/**
 * Month-navigation chevrons in the calendar panel — 18px, `#999`,
 * strokeWidth 1.5 (design lines 324-329). A wider viewBox and a different path
 * from {@link ChevronRightIcon}, so they get their own component.
 */
export function MonthChevronIcon({
  direction = 'left',
  size = 18,
  color = colors.muted,
  strokeWidth = 1.5,
  ...rest
}: IconProps & { direction?: 'left' | 'right' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18" fill="none" {...rest}>
      <Path
        d={direction === 'left' ? 'M11 4L5 9l6 5' : 'M7 4l6 5-6 5'}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Send arrow inside the dark Ask button — 13px, white, strokeWidth 1.8. */
export function SendIcon({
  size = 13,
  color = colors.canvas,
  strokeWidth = 1.8,
  ...rest
}: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" fill="none" {...rest}>
      <Path
        d="M3 8h10M9 4l4 4-4 4"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/* ---------------------------------------------------------------- tab icons */

/**
 * Tab icons share one shape: 22px viewBox, strokeWidth 1.6, ink when active
 * and `#C0C0C0` when not (design lines ~992-1004).
 */
export interface TabIconProps extends Omit<IconProps, 'color'> {
  active?: boolean;
  color?: string;
}

function TabIcon({
  paths,
  size = 22,
  active = false,
  color,
  strokeWidth = 1.6,
  ...rest
}: TabIconProps & { paths: string[] }) {
  const stroke = color ?? (active ? colors.ink : colors.faint);
  return (
    <Svg width={size} height={size} viewBox="0 0 22 22" fill="none" {...rest}>
      {paths.map((d, i) => (
        <Path
          key={i}
          d={d}
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      ))}
    </Svg>
  );
}

/** Raw path data, exported so an animated tab bar can rebuild these later. */
export const tabIconPaths = {
  calendar: [
    'M3 4.5h16M3 4.5v13a2 2 0 002 2h12a2 2 0 002-2v-13',
    'M3 8.5h16',
    'M7 2.5v4M15 2.5v4',
  ],
  events: ['M4 6h14M4 11h14M4 16h9'],
  feed: ['M3 3h6v6H3zM13 3h6v6h-6zM3 13h6v6H3zM13 13h6v6h-6z'],
} as const;

export function CalendarTabIcon(props: TabIconProps) {
  return <TabIcon paths={[...tabIconPaths.calendar]} {...props} />;
}

export function EventsTabIcon(props: TabIconProps) {
  return <TabIcon paths={[...tabIconPaths.events]} {...props} />;
}

export function FeedTabIcon(props: TabIconProps) {
  return <TabIcon paths={[...tabIconPaths.feed]} {...props} />;
}

/* --------------------------------------------------------------- timeline */

/** The 10px filled dot that marks an event's start on the capsule timeline. */
export function StartDot({ size = 10, color = colors.ink, ...rest }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 10 10" fill="none" {...rest}>
      <Circle cx={5} cy={5} r={5} fill={color} />
    </Svg>
  );
}

/** The hollow ring that marks an event's end on the capsule timeline. */
export function EndRing({
  size = 10,
  color = colors.ink,
  strokeWidth = 2,
  ...rest
}: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 10 10" fill="none" {...rest}>
      <Circle
        cx={5}
        cy={5}
        r={5 - strokeWidth / 2}
        stroke={color}
        strokeWidth={strokeWidth}
        fill="none"
      />
    </Svg>
  );
}

/* ------------------------------------------------------------------ picker */

/**
 * The tick beside the selected row in a settings picker. Same stroke language
 * as the chevrons — 1.8, round caps — so the two read as one family.
 */
export function CheckIcon({
  size = 15,
  color = colors.ink,
  strokeWidth = 1.8,
  ...rest
}: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" fill="none" {...rest}>
      <Path
        d="M3 8.5l3.5 3.5L13 4.5"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/**
 * Airplane glyph (top-down, nose up-right) — the route-line marker in flight
 * plugins. Stroke matches the app's other icons.
 */
export function PlaneIcon({
  size = 16,
  color = colors.ink,
  strokeWidth = 1.8,
  ...rest
}: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...rest}>
      <Path
        d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
