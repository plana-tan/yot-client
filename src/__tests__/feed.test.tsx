jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { addDays, startOfDay } from 'date-fns';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import type { AppEvent } from '@/api/types';
import { buildInsights } from '@/lib/askEngine';
import { useEvents } from '@/store/events';
import { usePlugins } from '@/store/plugins';
import { useSettings, type FeedLayout } from '@/store/settings';
import { buildSeedItems, designFranchises, useTracking } from '@/store/tracking';
import FeedScreen from '../../app/(tabs)/feed';

/**
 * The Feed tab: all four layouts, the Ask pane's streamed answer, and the
 * Tracking pane's filters and groups.
 */

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
}));

const { router } = jest.requireMock('expo-router') as { router: { push: jest.Mock } };

const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 402, height: 874 },
  insets: { top: 58, left: 0, right: 0, bottom: 34 },
};

const today = startOfDay(new Date());

function at(day: Date, hour: number, minute = 0): Date {
  const d = new Date(day);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function makeEvent(
  id: string,
  title: string,
  dayOffset: number,
  hour: number,
): AppEvent {
  const day = addDays(today, dayOffset);
  return {
    id,
    calendarId: 'cal-1',
    title,
    start: at(day, hour),
    end: at(day, hour + 1),
    allDay: false,
    color: '#E8453C',
  } as AppEvent;
}

/**
 * Enough events to exercise every branch: heroes (every 5th), pairs, an odd
 * leftover, the Magazine large/small alternation, the Mosaic span, and more
 * than eight Stories circles.
 */
const EVENTS: AppEvent[] = [
  makeEvent('e1', 'Team standup', 0, 10),
  makeEvent('e2', 'Dentist', 0, 14),
  makeEvent('e3', 'Coffee with Maya', 1, 9),
  makeEvent('e4', 'Design review', 2, 14),
  makeEvent('e5', 'Grocery pickup', 3, 15),
  makeEvent('e6', 'Brunch', 4, 11),
  makeEvent('e7', 'Movie night', 5, 19),
  makeEvent('e8', 'Car service', 6, 10),
  makeEvent('e9', 'Yoga class', 7, 16),
  makeEvent('e10', 'Lunch with Alex', 8, 12),
  makeEvent('e11', 'Book club', 9, 11),
  makeEvent('e12', 'Live jazz', 10, 19),
];

function seedEvents(events: AppEvent[]) {
  useEvents.setState({
    eventsById: Object.fromEntries(events.map((e) => [e.id, e])),
    calendarsById: {},
    hydrated: true,
    syncing: false,
    error: null,
    fetchedRange: null,
    lastSyncAt: null,
  });
}

function seedTracking() {
  useTracking.setState({
    franchises: designFranchises.map((f) => ({ ...f })),
    items: buildSeedItems(new Date()),
    seededAt: new Date().toISOString(),
    hydrated: true,
  });
}

function seedPlugins() {
  usePlugins.setState({
    added: [{ id: 'tracking-demo', title: 'Tracking', description: 'Demo', version: 1 }],
  });
}

function renderScreen() {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <FeedScreen />
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  seedEvents(EVENTS);
  seedTracking();
  seedPlugins();
  useSettings.setState({ feedLayout: 'dynamic', timeFormat: '12h' });
});

afterEach(() => {
  seedEvents([]);
  router.push.mockReset();
});

/* ---------------------------------------------------------------- layouts */

describe('Feed layouts', () => {
  const cases: [FeedLayout, string][] = [
    ['dynamic', 'feed-dynamic'],
    ['magazine', 'feed-magazine'],
    ['mosaic', 'feed-mosaic'],
    ['stories', 'feed-stories'],
  ];

  it.each(cases)('mounts the %s layout and renders every event', async (layout, testID) => {
    useSettings.setState({ feedLayout: layout });
    const { getByTestId } = await renderScreen();

    expect(getByTestId(testID)).toBeTruthy();

    // Mosaic only lays its cells out once it has measured its own width.
    if (layout === 'mosaic') {
      await act(async () => {
        fireEvent(getByTestId('feed-mosaic-grid'), 'layout', {
          nativeEvent: { layout: { width: 370, height: 600 } },
        });
      });
    }

    for (const event of EVENTS) {
      expect(getByTestId(`feed-card-${event.id}`)).toBeTruthy();
    }
  });

  it('splits Dynamic into a Next-up rail and a Coming-up grid', async () => {
    const { getByText } = await renderScreen();
    expect(getByText('NEXT UP')).toBeTruthy();
    expect(getByText('COMING UP')).toBeTruthy();
  });

  it('caps the Stories circle strip at eight', async () => {
    useSettings.setState({ feedLayout: 'stories' });
    const { queryByTestId } = await renderScreen();

    expect(queryByTestId('feed-circle-e8')).toBeTruthy();
    expect(queryByTestId('feed-circle-e9')).toBeNull();
  });

  it('opens the detail route from a feed card', async () => {
    const { getByTestId } = await renderScreen();
    await fireEvent.press(getByTestId('feed-card-e1'));
    expect(router.push).toHaveBeenCalledWith('/event/e1');
  });

  it('switches layout when the setting changes', async () => {
    const { getByTestId, queryByTestId, rerender } = await renderScreen();
    expect(getByTestId('feed-dynamic')).toBeTruthy();

    await act(async () => {
      useSettings.setState({ feedLayout: 'magazine' });
    });
    rerender(
      <SafeAreaProvider initialMetrics={METRICS}>
        <FeedScreen />
      </SafeAreaProvider>,
    );

    expect(queryByTestId('feed-dynamic')).toBeNull();
    expect(getByTestId('feed-magazine')).toBeTruthy();
  });
});

/* -------------------------------------------------------------------- ask */

describe('Ask pane', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  async function openAsk() {
    const utils = await renderScreen();
    await act(async () => {
      fireEvent.press(utils.getByText('Ask'));
    });
    return utils;
  }

  it('shows the ambient insight while idle', async () => {
    const { getByTestId } = await openAsk();
    // Which insight shows rotates off the clock, so assert it is one of the
    // ones this dataset can produce rather than pinning the rotation.
    const options = buildInsights(EVENTS, new Date());
    expect(options).toContain(getByTestId('ask-insight').props.children);
  });

  it('answers a query with dots, then text streamed word by word', async () => {
    const { getByTestId, queryByTestId } = await openAsk();

    await act(async () => {
      fireEvent.changeText(getByTestId('ask-input'), 'brief me on today');
    });
    // The send button only appears once there is something to send.
    await act(async () => {
      fireEvent.press(getByTestId('ask-send'));
    });

    expect(getByTestId('ask-loading')).toBeTruthy();

    // The think pause is 400-700ms.
    await act(async () => {
      jest.advanceTimersByTime(700);
    });
    expect(queryByTestId('ask-loading')).toBeNull();

    const partial = getByTestId('ask-text').props.children as string;
    expect(partial.length).toBeGreaterThan(0);

    // Words land every 30-70ms; ten seconds is far past the end.
    await act(async () => {
      jest.advanceTimersByTime(10_000);
    });

    const full = getByTestId('ask-text').props.children as string;
    expect(full).toContain('You have 2 events today.');
    expect(full).toContain('Starting with Team standup');
    expect(full.length).toBeGreaterThanOrEqual(partial.length);
  });

  it('renders preview chips that open the event, plus action pills', async () => {
    const { getByTestId } = await openAsk();

    await act(async () => {
      fireEvent.changeText(getByTestId('ask-input'), 'brief me on today');
    });
    await act(async () => {
      fireEvent.press(getByTestId('ask-send'));
      jest.advanceTimersByTime(10_000);
    });

    // Today's two events preview as chips.
    expect(getByTestId('ask-chip-e1')).toBeTruthy();
    expect(getByTestId('ask-chip-e2')).toBeTruthy();
    expect(getByTestId('ask-action-See full day')).toBeTruthy();

    await act(async () => {
      fireEvent.press(getByTestId('ask-chip-e1'));
    });
    expect(router.push).toHaveBeenCalledWith('/event/e1');
  });

  it('Clear returns the pane to its idle insight', async () => {
    const { getByTestId, queryByTestId } = await openAsk();

    await act(async () => {
      fireEvent.changeText(getByTestId('ask-input'), 'find free time');
    });
    await act(async () => {
      fireEvent.press(getByTestId('ask-send'));
      jest.advanceTimersByTime(10_000);
    });
    expect(getByTestId('ask-answer')).toBeTruthy();

    await act(async () => {
      fireEvent.press(getByTestId('ask-clear'));
    });

    expect(queryByTestId('ask-answer')).toBeNull();
    expect(getByTestId('ask-insight')).toBeTruthy();
  });
});

/* --------------------------------------------------------------- tracking */

describe('Tracking pane', () => {
  async function openTracking() {
    const utils = await renderScreen();
    await act(async () => {
      fireEvent.press(utils.getByText('Tracking'));
    });
    // The pane now shows a loader first; wait for the spec to resolve.
    await utils.findByTestId('tracking-row-t1');
    return utils;
  }

  it('retitles the screen and lists grouped items', async () => {
    const { getByTestId } = await openTracking();

    expect(getByTestId('feed-header-title')).toHaveTextContent('Tracking');
    expect(getByTestId('feed-tracking')).toBeTruthy();

    // The seeded dataset always has something live and something unannounced.
    expect(getByTestId('tracking-group-Active')).toBeTruthy();
    expect(getByTestId('tracking-group-TBA')).toBeTruthy();
    expect(getByTestId('tracking-row-t1')).toBeTruthy();
  });

  it('filters to one franchise from the pills, and back with All', async () => {
    const { getByTestId, queryByTestId } = await openTracking();

    await act(async () => {
      fireEvent.press(getByTestId('tracking-pill-OP'));
    });
    // t2/t8 are One Piece; t1 is Genshin and must drop out.
    expect(getByTestId('tracking-row-t2')).toBeTruthy();
    expect(queryByTestId('tracking-row-t1')).toBeNull();

    await act(async () => {
      fireEvent.press(getByTestId('tracking-pill-All'));
    });
    expect(getByTestId('tracking-row-t1')).toBeTruthy();
  });

  it('opens the tracking detail route from a row', async () => {
    const { getByTestId } = await openTracking();

    await act(async () => {
      fireEvent.press(getByTestId('tracking-row-t1'));
    });
    expect(router.push).toHaveBeenCalledWith('/tracking/t1');
  });
});
