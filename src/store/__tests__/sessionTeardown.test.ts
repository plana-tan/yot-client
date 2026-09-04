jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('@/api/session', () => ({
  clearSession: jest.fn(async () => undefined),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearSession } from '@/api/session';
import { PLUGIN_SPEC_CACHE_KEY } from '@/plugins/specCache';
import { clearLocalSessionData } from '@/store/sessionTeardown';
import { EVENTS_CACHE_KEY, useEvents } from '@/store/events';
import { defaultSettings, useSettings } from '@/store/settings';

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  useEvents.setState({
    eventsById: {
      e1: {
        id: 'e1',
        calendarId: 'cal',
        title: 'Private event',
        start: new Date('2026-09-04T10:00:00Z'),
        end: new Date('2026-09-04T11:00:00Z'),
        allDay: false,
        color: '#000000',
      },
    },
    calendarsById: {},
    fetchedRange: null,
    lastSyncAt: null,
    syncing: false,
    error: null,
    errorId: 0,
    errorAt: null,
    hydrated: true,
  });
  useSettings.setState({ ...defaultSettings, hydrated: true, onboarded: true });
  await AsyncStorage.setItem(EVENTS_CACHE_KEY, '{"version":2,"events":[]}');
  await AsyncStorage.setItem(PLUGIN_SPEC_CACHE_KEY, '{"version":1,"specs":{}}');
});

describe('clearLocalSessionData', () => {
  it('clears credentials, event data, plugin specs, and settings together', async () => {
    await clearLocalSessionData();

    expect(clearSession).toHaveBeenCalledTimes(1);
    expect(await AsyncStorage.getItem(EVENTS_CACHE_KEY)).toBeNull();
    expect(await AsyncStorage.getItem(PLUGIN_SPEC_CACHE_KEY)).toBeNull();
    expect(useEvents.getState().eventsById).toEqual({});
    expect(useSettings.getState().onboarded).toBe(false);
  });

  it('continues clearing local data when credential storage fails', async () => {
    (clearSession as jest.Mock).mockRejectedValueOnce(new Error('keystore unavailable'));

    await expect(clearLocalSessionData()).resolves.toBeUndefined();

    expect(await AsyncStorage.getItem(EVENTS_CACHE_KEY)).toBeNull();
    expect(await AsyncStorage.getItem(PLUGIN_SPEC_CACHE_KEY)).toBeNull();
    expect(useEvents.getState().eventsById).toEqual({});
    expect(useSettings.getState().onboarded).toBe(false);
  });
});
