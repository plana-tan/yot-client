jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { EVENTS_CACHE_KEY, useEvents } from '@/store/events';
import { PLUGIN_SPEC_CACHE_KEY } from '@/plugins/specCache';
import { defaultSettings, useSettings } from '@/store/settings';
import SettingsScreen from '../../app/settings';

/**
 * Settings. The point of this screen is that every row is *wired*, so the
 * assertions are all "tap the control, read the store" — plus the Disconnect
 * teardown, which is the one destructive path in the app.
 */

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
}));

jest.mock('@/api/client', () => ({ logout: jest.fn(async () => undefined) }));
jest.mock('@/api/session', () => ({ clearSession: jest.fn(async () => undefined) }));

const { router } = jest.requireMock('expo-router') as { router: { replace: jest.Mock } };
const { logout } = jest.requireMock('@/api/client') as { logout: jest.Mock };
const { clearSession } = jest.requireMock('@/api/session') as { clearSession: jest.Mock };

const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 402, height: 874 },
  insets: { top: 58, left: 0, right: 0, bottom: 34 },
};

/**
 * `render` resolves asynchronously in this version of the testing library, so
 * every test awaits the screen before querying it — as the repo's other screen
 * tests do.
 */
type View = Awaited<ReturnType<typeof render>>;

function renderScreen(): Promise<View> {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <SettingsScreen />
    </SafeAreaProvider>,
  );
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  useSettings.setState({ ...defaultSettings, hydrated: true, serverUrl: 'http://cal.local:4010' });
  useEvents.setState({ eventsById: {}, calendarsById: {}, lastSyncAt: null, hydrated: true });
});

/* -------------------------------------------------------------------- shell */

describe('shell', () => {
  it('renders the title, all four section headings and the server address', async () => {
    const screen = await renderScreen();

    expect(screen.getByTestId('settings-title')).toHaveTextContent('Settings');
    for (const heading of ['Server', 'Display', 'Agent', 'Data']) {
      expect(screen.getByText(heading)).toBeTruthy();
    }
    expect(screen.getByTestId('settings-server-url')).toHaveTextContent('http://cal.local:4010');
  });

  it('says so plainly when there is no paired server', async () => {
    useSettings.setState({ serverUrl: null });
    const screen = await renderScreen();
    expect(screen.getByTestId('settings-server-url')).toHaveTextContent('Not connected');
  });
});

/* ------------------------------------------------------------------ display */

describe('display rows write to the store', () => {
  it('Start week on', async () => {
    const screen = await renderScreen();
    await fireEvent.press(screen.getByText('Sun'));
    expect(useSettings.getState().weekStart).toBe('Sun');
  });

  it('Time format', async () => {
    const screen = await renderScreen();
    expect(useSettings.getState().timeFormat).toBe('12h');
    await fireEvent.press(screen.getByText('24h'));
    expect(useSettings.getState().timeFormat).toBe('24h');
  });

  it('Time zone mode, which reveals the Region row only when Manual', async () => {
    const screen = await renderScreen();
    expect(screen.queryByTestId('row-region')).toBeNull();

    await fireEvent.press(screen.getByText('Manual'));
    expect(useSettings.getState().tzMode).toBe('Manual');
    expect(screen.getByTestId('row-region')).toBeTruthy();

    await fireEvent.press(screen.getByText('Auto'));
    expect(screen.queryByTestId('row-region')).toBeNull();
  });
});

describe('pickers', () => {
  it('Default view: opens, ticks the current value, writes the new one', async () => {
    const screen = await renderScreen();
    expect(screen.getByTestId('settings-default-view-value')).toHaveTextContent('Calendar');

    await fireEvent.press(screen.getByTestId('row-default-view'));
    expect(screen.getByTestId('picker-title')).toHaveTextContent('Default view');

    await fireEvent.press(screen.getByTestId('picker-option-feed'));

    expect(useSettings.getState().defaultView).toBe('feed');
    // Selecting closes the overlay and the row shows the new value.
    expect(screen.queryByTestId('settings-picker')).toBeNull();
    expect(screen.getByTestId('settings-default-view-value')).toHaveTextContent('Feed');
  });

  it('Feed layout: offers all four layouts', async () => {
    const screen = await renderScreen();
    await fireEvent.press(screen.getByTestId('row-feed-layout'));

    for (const layout of ['dynamic', 'magazine', 'mosaic', 'stories']) {
      expect(screen.getByTestId(`picker-option-${layout}`)).toBeTruthy();
    }

    await fireEvent.press(screen.getByTestId('picker-option-mosaic'));
    expect(useSettings.getState().feedLayout).toBe('mosaic');
    expect(screen.getByTestId('settings-feed-layout-value')).toHaveTextContent('Mosaic');
  });

  it('Region: lists IANA zones and pins the chosen one', async () => {
    useSettings.setState({ tzMode: 'Manual', timeZone: 'UTC' });
    const screen = await renderScreen();

    await fireEvent.press(screen.getByTestId('row-region'));
    await fireEvent.press(screen.getByTestId('picker-option-Asia/Tokyo'));

    expect(useSettings.getState().timeZone).toBe('Asia/Tokyo');
    expect(screen.getByTestId('settings-region-value')).toHaveTextContent('Asia/Tokyo');
  });

  it('Back leaves the current value alone', async () => {
    const screen = await renderScreen();
    await fireEvent.press(screen.getByTestId('row-feed-layout'));
    await fireEvent.press(screen.getByTestId('picker-back'));

    expect(screen.queryByTestId('settings-picker')).toBeNull();
    expect(useSettings.getState().feedLayout).toBe('dynamic');
  });
});

/* -------------------------------------------------------------------- agent */

describe('agent toggles', () => {
  it('persist both directions', async () => {
    const screen = await renderScreen();

    await fireEvent.press(screen.getByLabelText('Auto-suggestions'));
    expect(useSettings.getState().autoSuggest).toBe(false);

    await fireEvent.press(screen.getByLabelText('Smart notifications'));
    expect(useSettings.getState().smartNotifs).toBe(true);
  });
});

/* --------------------------------------------------------------------- data */

describe('local cache row', () => {
  it('reports the real size of the stored snapshot', async () => {
    await AsyncStorage.setItem(EVENTS_CACHE_KEY, 'x'.repeat(14 * 1024));
    const screen = await renderScreen();

    await waitFor(() => expect(screen.getByTestId('settings-cache-size')).toHaveTextContent('14 KB'));
  });

  it('reads 0 B with nothing cached', async () => {
    const screen = await renderScreen();
    await waitFor(() => expect(screen.getByTestId('settings-cache-size')).toHaveTextContent('0 B'));
  });

  it('includes event and plugin snapshots in the displayed cache size', async () => {
    await AsyncStorage.setItem(EVENTS_CACHE_KEY, '1234');
    await AsyncStorage.setItem(PLUGIN_SPEC_CACHE_KEY, '123456');
    const screen = await renderScreen();

    await waitFor(() => expect(screen.getByTestId('settings-cache-size')).toHaveTextContent('10 B'));
  });
});

describe('disconnect', () => {
  it('asks first, and cancelling changes nothing', async () => {
    const screen = await renderScreen();

    await fireEvent.press(screen.getByTestId('row-disconnect'));
    expect(screen.getByTestId('disconnect-confirm')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('disconnect-cancel'));
    expect(screen.queryByTestId('disconnect-confirm')).toBeNull();
    expect(logout).not.toHaveBeenCalled();
    expect(useSettings.getState().onboarded).toBe(false);
  });

  it('revokes the key, clears session + cache + settings, and lands on onboarding', async () => {
    await AsyncStorage.setItem(EVENTS_CACHE_KEY, '{"version":1,"events":[]}');
    await AsyncStorage.setItem(PLUGIN_SPEC_CACHE_KEY, '{"version":1,"specs":{"flight-manager":{}}}');
    useSettings.setState({ onboarded: true, feedLayout: 'stories', timeFormat: '24h' });
    const screen = await renderScreen();

    await fireEvent.press(screen.getByTestId('row-disconnect'));
    await fireEvent.press(screen.getByTestId('disconnect-confirm-button'));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/onboarding'));

    // Server-side revocation first, then every local trace.
    expect(logout).toHaveBeenCalledTimes(1);
    expect(clearSession).toHaveBeenCalledTimes(1);
    expect(await AsyncStorage.getItem(EVENTS_CACHE_KEY)).toBeNull();
    expect(await AsyncStorage.getItem(PLUGIN_SPEC_CACHE_KEY)).toBeNull();
    expect(useEvents.getState().eventsById).toEqual({});

    const settings = useSettings.getState();
    expect(settings.onboarded).toBe(false);
    expect(settings.feedLayout).toBe('dynamic');
    expect(settings.timeFormat).toBe('12h');
  });

  it('still tears down locally when the server refuses the logout', async () => {
    // A dead or unreachable server must not trap the user on this screen.
    logout.mockRejectedValueOnce(new Error('Network request failed'));
    useSettings.setState({ onboarded: true });
    const screen = await renderScreen();

    await fireEvent.press(screen.getByTestId('row-disconnect'));
    await fireEvent.press(screen.getByTestId('disconnect-confirm-button'));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/onboarding'));
    expect(clearSession).toHaveBeenCalledTimes(1);
    expect(useSettings.getState().onboarded).toBe(false);
  });
});
