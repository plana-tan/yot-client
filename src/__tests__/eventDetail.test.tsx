jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { format, startOfDay } from 'date-fns';
import { Alert } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import type { AppEvent, Calendar } from '@/api/types';
import { useEvents } from '@/store/events';
import EventDetailScreen from '../../app/event/[id]';

/**
 * Event detail and its edit sheet.
 *
 * The store is seeded for real, but the two network-backed actions
 * (`editEvent` / `removeEvent`) are replaced with spies — the point here is
 * that the screen calls them with the right patch, not that the client works
 * (which `store/__tests__/events.test.ts` already covers).
 */

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: jest.fn(() => ({ id: 'e1' })),
}));

// The picker needs a native module; the screen only has to render and wire it.
jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');

// The fetch-on-miss path (`GET /events/:id`) — spy via the API client module.
// The `mock` prefix lets the factory reference it (jest hoisting rule).
const mockGetEvent = jest.fn();
jest.mock('@/api/client', () => ({
  getEvent: (...args: unknown[]) => mockGetEvent(...args),
}));

const routerMock = jest.requireMock('expo-router') as {
  router: { back: jest.Mock; replace: jest.Mock };
  useLocalSearchParams: jest.Mock;
};

const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 402, height: 874 },
  insets: { top: 58, left: 0, right: 0, bottom: 34 },
};

const today = startOfDay(new Date());

function at(hour: number, minute = 0): Date {
  const d = new Date(today);
  d.setHours(hour, minute, 0, 0);
  return d;
}

const CALENDAR: Calendar = { id: 'cal-1', name: 'Personal', color: '#E8453C' } as Calendar;

const EVENT: AppEvent = {
  id: 'e1',
  calendarId: 'cal-1',
  title: 'Dentist',
  description: 'Checkup and cleaning.',
  location: '450 Sutter St, Suite 340',
  start: at(14, 30),
  end: at(15, 30),
  allDay: false,
  color: '#E8453C',
} as AppEvent;

let editEvent: jest.Mock;
let removeEvent: jest.Mock;

function seed(event: AppEvent | null) {
  editEvent = jest.fn().mockResolvedValue({ ok: true });
  removeEvent = jest.fn().mockResolvedValue({ ok: true });
  useEvents.setState({
    eventsById: event ? { [event.id]: event } : {},
    calendarsById: { [CALENDAR.id]: CALENDAR },
    hydrated: true,
    syncing: false,
    error: null,
    fetchedRange: null,
    lastSyncAt: null,
    editEvent,
    removeEvent,
  });
}

function renderScreen() {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <EventDetailScreen />
    </SafeAreaProvider>,
  );
}

afterEach(() => {
  jest.clearAllMocks();
  routerMock.useLocalSearchParams.mockReturnValue({ id: 'e1' });
});

describe('Event detail', () => {
  it('renders the title, date line, description and metadata rows', async () => {
    seed(EVENT);
    const { getByTestId, getByText, queryByText } = await renderScreen();

    expect(getByTestId('event-title')).toHaveTextContent('Dentist');
    // "{Weekday}, {Month D} · {time range}"
    expect(getByTestId('event-subtitle')).toHaveTextContent(
      new RegExp(`^${format(EVENT.start, 'EEEE, MMMM d')} · 2:30 – 3:30 PM · 1 hr$`),
    );
    expect(getByTestId('event-description')).toHaveTextContent('Checkup and cleaning.');

    // Calendar / Location / Duration — and no Source row (Yot has no source).
    expect(getByText('Calendar')).toBeTruthy();
    expect(getByText('Personal')).toBeTruthy();
    expect(getByText('Location')).toBeTruthy();
    expect(getByText('450 Sutter St, Suite 340')).toBeTruthy();
    expect(getByText('Duration')).toBeTruthy();
    expect(queryByText('Source')).toBeNull();
  });

  it('omits the Location row when the event has no location', async () => {
    seed({ ...EVENT, location: undefined });
    const { queryByText } = await renderScreen();
    expect(queryByText('Location')).toBeNull();
  });

  it('falls back to a not-found state for an unknown id', async () => {
    seed(null);
    mockGetEvent.mockRejectedValue(new Error('404'));
    routerMock.useLocalSearchParams.mockReturnValue({ id: 'nope' });

    const { getByText, getByTestId } = await renderScreen();
    expect(getByText('Event not found')).toBeTruthy();

    await fireEvent.press(getByTestId('event-back'));
    expect(routerMock.router.back).toHaveBeenCalled();
  });

  it('goes back from the Back link', async () => {
    seed(EVENT);
    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('event-back'));
    expect(routerMock.router.back).toHaveBeenCalled();
  });

  it('fetches an event missing from the store (e.g. hidden plugin events)', async () => {
    seed(null);
    routerMock.useLocalSearchParams.mockReturnValue({
      id: 'b69a1c40-c782-485f-bedb-26c9c844edad',
    });
    mockGetEvent.mockResolvedValue({
      id: 'b69a1c40-c782-485f-bedb-26c9c844edad',
      calendar_id: 'cal-1',
      title: 'HND → LHR',
      description: 'Passenger ARAKI/RIKA · Reservation D90ST6 · Seat 39A',
      context: null,
      location: null,
      start_at: '2026-09-04T00:55:00Z',
      end_at: '2026-09-04T15:20:00Z',
      all_day: false,
      image_path: null,
      url: null,
      source_uid: null,
      created_at: '2026-08-29T00:00:00Z',
      updated_at: '2026-08-29T00:00:00Z',
      tags: [],
      reminders: [],
    });

    const { getByTestId } = await renderScreen();
    expect(mockGetEvent).toHaveBeenCalledWith('b69a1c40-c782-485f-bedb-26c9c844edad');
    await waitFor(() => expect(getByTestId('event-title')).toHaveTextContent('HND → LHR'));
  });

  it('stays on the missing state when the fetch fails', async () => {
    seed(null);
    routerMock.useLocalSearchParams.mockReturnValue({ id: 'gone' });
    mockGetEvent.mockRejectedValue(new Error('404'));

    const { getByText } = await renderScreen();
    await waitFor(() => expect(getByText('Event not found')).toBeTruthy());
    await waitFor(() =>
      expect(getByText('It may have been deleted, or it is outside the synced range.')).toBeTruthy(),
    );
  });
});

describe('Edit sheet', () => {
  it('opens from Edit and saves the patch through the store', async () => {
    seed(EVENT);
    const { getByTestId, queryByTestId } = await renderScreen();

    expect(queryByTestId('event-edit-sheet')).toBeNull();
    await fireEvent.press(getByTestId('event-edit'));
    expect(getByTestId('event-edit-sheet')).toBeTruthy();

    // The fields open pre-filled with the current values.
    expect(getByTestId('edit-title').props.value).toBe('Dentist');
    expect(getByTestId('edit-description').props.value).toBe('Checkup and cleaning.');

    await fireEvent.changeText(getByTestId('edit-title'), 'Dentist — rescheduled');
    await fireEvent.changeText(getByTestId('edit-description'), 'Moved to the afternoon.');
    await fireEvent.press(getByTestId('edit-save'));

    await waitFor(() => expect(editEvent).toHaveBeenCalledTimes(1));
    expect(editEvent).toHaveBeenCalledWith('e1', {
      title: 'Dentist — rescheduled',
      description: 'Moved to the afternoon.',
      start: EVENT.start,
      end: EVENT.end,
    });

    // Saving closes the sheet, dropping back to the detail page.
    await waitFor(() => expect(queryByTestId('event-edit-sheet')).toBeNull());
  });

  it('clears the description to null when the field is emptied', async () => {
    seed(EVENT);
    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('event-edit'));
    await fireEvent.changeText(getByTestId('edit-description'), '   ');
    await fireEvent.press(getByTestId('edit-save'));

    await waitFor(() => expect(editEvent).toHaveBeenCalledTimes(1));
    expect(editEvent.mock.calls[0][1].description).toBeNull();
  });

  it('discards the draft on Cancel', async () => {
    seed(EVENT);
    const { getByTestId, queryByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('event-edit'));
    await fireEvent.changeText(getByTestId('edit-title'), 'Nope');
    await fireEvent.press(getByTestId('edit-cancel'));

    await waitFor(() => expect(queryByTestId('event-edit-sheet')).toBeNull());
    expect(editEvent).not.toHaveBeenCalled();
    expect(getByTestId('event-title')).toHaveTextContent('Dentist');
  });

  it('keeps the end after the start when the start is dragged past it', async () => {
    seed(EVENT);
    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('event-edit'));
    await fireEvent.press(getByTestId('edit-start'));

    // 4:00 PM — an hour past the current 3:30 PM end.
    const movedStart = at(16, 0);
    await fireEvent(getByTestId('edit-start-picker'), 'change', { type: 'set' }, movedStart);
    await fireEvent.press(getByTestId('edit-save'));

    await waitFor(() => expect(editEvent).toHaveBeenCalledTimes(1));
    const patch = editEvent.mock.calls[0][1] as { start: Date; end: Date };
    expect(patch.start.getHours()).toBe(16);
    // Clamped forward by the original one-hour span rather than left invalid.
    expect(patch.end.getTime()).toBeGreaterThan(patch.start.getTime());
    expect(patch.end.getHours()).toBe(17);
  });

  it('deletes through the store and pops back to the list', async () => {
    seed(EVENT);
    // Alert is inert under jest, so the destructive button is pressed by hand.
    const alert = jest
      .spyOn(Alert, 'alert')
      .mockImplementation((_title, _message, buttons) => {
        buttons?.find((b) => b.style === 'destructive')?.onPress?.();
      });

    const { getByTestId } = await renderScreen();
    await fireEvent.press(getByTestId('event-edit'));
    await fireEvent.press(getByTestId('edit-delete'));

    expect(alert).toHaveBeenCalled();
    await waitFor(() => expect(removeEvent).toHaveBeenCalledWith('e1'));
    await waitFor(() => expect(routerMock.router.back).toHaveBeenCalled());

    alert.mockRestore();
  });

  it('does not delete when the confirmation is dismissed', async () => {
    seed(EVENT);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

    const { getByTestId } = await renderScreen();
    await fireEvent.press(getByTestId('event-edit'));
    await fireEvent.press(getByTestId('edit-delete'));

    expect(alert).toHaveBeenCalled();
    expect(removeEvent).not.toHaveBeenCalled();

    alert.mockRestore();
  });
});
