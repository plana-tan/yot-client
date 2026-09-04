import React from 'react';
import { act, render, waitFor } from '@testing-library/react-native';

let mockUnauthorizedHandler: (() => void) | null = null;
const mockReplace = jest.fn();
const mockClearLocalSessionData = jest.fn(async () => undefined);
const mockLoadSession = jest.fn(async () => ({ baseUrl: 'https://yot.example', key: 'key', scope: 'write' }));
const mockUseLiveSync = jest.fn();
const mockEventState = {
  hydrate: jest.fn(async () => undefined),
  sync: jest.fn(async () => ({ ok: true as const })),
};
const mockSettingsState = {
  hydrated: true,
  onboarded: true,
  defaultView: 'calendar',
  reset: jest.fn(),
};

jest.mock('@expo-google-fonts/plus-jakarta-sans', () => ({
  PlusJakartaSans_300Light: 'font',
  PlusJakartaSans_400Regular: 'font',
  PlusJakartaSans_500Medium: 'font',
  PlusJakartaSans_600SemiBold: 'font',
  PlusJakartaSans_700Bold: 'font',
  PlusJakartaSans_800ExtraBold: 'font',
  useFonts: () => [true, null],
}));

jest.mock('expo-router', () => {
  const ReactModule = require('react');
  const Stack = ({ children }: { children?: React.ReactNode }) =>
    ReactModule.createElement(ReactModule.Fragment, null, children);
  Stack.Protected = ({ children }: { children?: React.ReactNode }) =>
    ReactModule.createElement(ReactModule.Fragment, null, children);
  Stack.Screen = () => null;
  return {
    Stack,
    router: {
      replace: (...args: unknown[]) => mockReplace(...args),
      canGoBack: () => false,
      back: jest.fn(),
    },
  };
});

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(async () => undefined),
  hideAsync: jest.fn(async () => undefined),
}));

jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('react-native-gesture-handler', () => {
  const ReactModule = require('react');
  return {
    GestureHandlerRootView: ({ children }: { children?: React.ReactNode }) =>
      ReactModule.createElement(ReactModule.Fragment, null, children),
  };
});
jest.mock('react-native-safe-area-context', () => {
  const ReactModule = require('react');
  return {
    SafeAreaProvider: ({ children }: { children?: React.ReactNode }) =>
      ReactModule.createElement(ReactModule.Fragment, null, children),
  };
});

jest.mock('@/api/client', () => ({
  setUnauthorizedHandler: jest.fn((handler: (() => void) | null) => {
    mockUnauthorizedHandler = handler;
  }),
}));
jest.mock('@/api/session', () => ({ loadSession: () => mockLoadSession() }));
jest.mock('@/hooks/useLiveSync', () => ({ useLiveSync: (options: unknown) => mockUseLiveSync(options) }));
jest.mock('@/store/events', () => ({
  useEvents: Object.assign(jest.fn(), { getState: () => mockEventState }),
}));
jest.mock('@/store/sessionTeardown', () => ({
  clearLocalSessionData: () => mockClearLocalSessionData(),
}));
jest.mock('@/store/settings', () => ({
  useSettings: Object.assign(
    (selector: (state: typeof mockSettingsState) => unknown) => selector(mockSettingsState),
    { getState: () => mockSettingsState },
  ),
}));
jest.mock('@/theme/ThemeProvider', () => {
  const ReactModule = require('react');
  return {
    ThemeProvider: ({ children }: { children?: React.ReactNode }) =>
      ReactModule.createElement(ReactModule.Fragment, null, children),
  };
});
jest.mock('@/theme/context', () => ({
  useTheme: () => ({ theme: 'light', colors: { canvas: '#ffffff' } }),
}));

import RootLayout from '../../app/_layout';

beforeEach(() => {
  jest.clearAllMocks();
  mockUnauthorizedHandler = null;
  mockSettingsState.hydrated = true;
  mockSettingsState.onboarded = true;
});

async function renderBootstrappedRoot() {
  const view = await render(<RootLayout />);
  await waitFor(() => expect(mockUnauthorizedHandler).toEqual(expect.any(Function)));
  await waitFor(() => expect(mockUseLiveSync).toHaveBeenCalled());
  return view;
}

describe('RootLayout unauthorized teardown', () => {
  it('uses the shared local teardown for REST authorization loss', async () => {
    await renderBootstrappedRoot();

    await act(async () => {
      mockUnauthorizedHandler?.();
    });

    await waitFor(() => expect(mockClearLocalSessionData).toHaveBeenCalledTimes(1));
    expect(mockReplace).toHaveBeenCalledWith('/onboarding');
  });

  it('uses the shared local teardown for live-sync authorization loss', async () => {
    await renderBootstrappedRoot();
    const options = mockUseLiveSync.mock.calls.at(-1)?.[0] as { onUnauthorized: () => void };

    await act(async () => {
      options.onUnauthorized();
    });

    await waitFor(() => expect(mockClearLocalSessionData).toHaveBeenCalledTimes(1));
    expect(mockReplace).toHaveBeenCalledWith('/onboarding');
  });
});
