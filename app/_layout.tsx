import {
  PlusJakartaSans_300Light,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/plus-jakarta-sans';
import { Stack, router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { setUnauthorizedHandler } from '@/api/client';
import { loadSession } from '@/api/session';
import { useLiveSync } from '@/hooks/useLiveSync';
import { useEvents } from '@/store/events';
import { clearLocalSessionData } from '@/store/sessionTeardown';
import { type DefaultView, useSettings } from '@/store/settings';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { useTheme } from '@/theme/context';

// Hold the splash screen until the fonts are ready, so the first frame the
// user sees is already in Plus Jakarta Sans rather than the system face.
void SplashScreen.preventAutoHideAsync();

/** Which tab `settings.defaultView` opens on. `calendar` is the index route. */
const VIEW_ROUTE: Record<DefaultView, string> = {
  calendar: '/',
  events: '/events',
  feed: '/feed',
};

export default function RootLayout() {
  return (
    <ThemeProvider>
      <Root />
    </ThemeProvider>
  );
}

function Root() {
  const { theme, colors } = useTheme();

  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_300Light,
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  /** True once storage has been read: the session and the event cache. */
  const [bootstrapped, setBootstrapped] = useState(false);
  /** A stored key was found — the other half of the onboarding gate. */
  const [hasSession, setHasSession] = useState(false);

  const settingsHydrated = useSettings((s) => s.hydrated);
  const onboarded = useSettings((s) => s.onboarded);

  /* --------------------------------------------------------------- bootstrap */

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      // The event cache and the session read are independent; run them together
      // so a slow Keychain unlock does not also delay the cached first paint.
      const [session] = await Promise.all([loadSession(), useEvents.getState().hydrate()]);
      if (cancelled) return;

      setHasSession(!!session);
      setBootstrapped(true);

      // Refresh in the background: the cache is already on screen, and a dead
      // server must not stop the app from opening.
      if (session) void useEvents.getState().sync();
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /* ------------------------------------------------------------ 401 handling */

  useEffect(() => {
    setUnauthorizedHandler(() => {
      void (async () => {
        await clearLocalSessionData();
        // Teardown clears `onboarded`, which flips the guard below. The
        // explicit replace covers the case where the 401 arrived while a
        // pushed screen (a detail page) was on top of the stack.
        setHasSession(false);
        router.replace('/onboarding');
      })();
    });

    return () => setUnauthorizedHandler(null);
  }, []);

  /* ------------------------------------------------------- session tracking */

  const landed = useRef(false);
  const paired = hasSession && onboarded;

  // `onboarded` is the one signal both the pairing flow and Disconnect flip, so
  // it is the cue to re-read the keystore. Without this, pairing again inside a
  // single app session would leave `hasSession` false and strand the user on
  // onboarding even though the key was written.
  useEffect(() => {
    if (!bootstrapped) return;
    if (!onboarded) {
      setHasSession(false);
      return;
    }
    let cancelled = false;
    void loadSession().then((session) => {
      if (!cancelled) setHasSession(!!session);
    });
    return () => {
      cancelled = true;
    };
  }, [bootstrapped, onboarded]);

  /* ----------------------------------------------------------- live updates */

  useLiveSync({
    enabled: paired,
    // The stream's 401 path is the same trapdoor as the REST client's.
    onUnauthorized: () => {
      void (async () => {
        await clearLocalSessionData();
        setHasSession(false);
        router.replace('/onboarding');
      })();
    },
  });

  /* ----------------------------------------------------- default-view landing */

  useEffect(() => {
    if (!bootstrapped || !settingsHydrated || !paired || landed.current) return;
    landed.current = true;
    const target = VIEW_ROUTE[useSettings.getState().defaultView];
    // `/` is where the tabs navigator already lands; only move for the others.
    if (target !== '/') router.replace(target);
  }, [bootstrapped, settingsHydrated, paired]);

  /* ------------------------------------------------------------------ splash */

  const ready = (fontsLoaded || !!fontError) && bootstrapped && settingsHydrated;

  const hideSplash = useCallback(async () => {
    if (ready) await SplashScreen.hideAsync();
  }, [ready]);

  useEffect(() => {
    // If the fonts fail to load we still continue — falling back to the system
    // face beats holding the splash screen forever.
    void hideSplash();
  }, [hideSplash]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={[styles.root, { backgroundColor: colors.canvas }]}>
      <SafeAreaProvider>
        <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.canvas },
          }}
        >
          <Stack.Protected guard={paired}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="settings" />
            <Stack.Screen name="event/[id]" />
            <Stack.Screen name="tracking/[id]" />
          </Stack.Protected>
          <Stack.Protected guard={!paired}>
            <Stack.Screen name="onboarding" />
          </Stack.Protected>
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
