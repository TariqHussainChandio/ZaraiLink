import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import React, { useEffect } from 'react';
import { StatusBar, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary, OfflineBanner } from './frontend/common/components';
import { connectQueryManagers, persistOptions, queryClient } from './frontend/hooks/queryClient';
import { linking } from './frontend/navigation/linking';
import { RootNavigator } from './frontend/navigation/stacks/RootNavigator';
import { configureGeneratedClient } from './frontend/services/api/client';
import { useAuthStore } from './frontend/state/authStore';
import { darkColors, lightColors, ThemeProvider, useIsDarkMode } from './frontend/theme';

// P7: the generated API client (frontend/services/api/generated) shares the app's request pipeline: session token, timeouts, retries, ApiError.
configureGeneratedClient();

// React Navigation styles its own native chrome (native-stack headers, the bottom tab bar) from
// this `theme` prop, not from `useTheme()` — screen content and the surrounding navigation
// chrome need to agree on light/dark, so this is built from the same `lightColors`/`darkColors` as
// everything else rather than React Navigation's own unrelated default palette.
function buildNavigationTheme(isDark: boolean) {
  const base = isDark ? DarkTheme : DefaultTheme;
  const palette = isDark ? darkColors : lightColors;
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: palette.accent.brand.mark,
      background: palette.ground,
      card: palette.surface,
      text: palette.ink,
      border: palette.line,
    },
  };
}

function AppShell() {
  const isDark = useIsDarkMode();

  return (
    <NavigationContainer linking={linking} theme={buildNavigationTheme(isDark)}>
      {/* The status bar's icons follow the app's own light/dark choice (Settings), not the phone's: left to the phone,
          a dark phone showing the light app drew white icons on white. */}
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <OfflineBanner />
      <RootNavigator />
    </NavigationContainer>
  );
}

function App() {
  useEffect(() => {
    const unsubscribe = useAuthStore.getState().initialize();
    const disconnectQueryManagers = connectQueryManagers();
    return () => {
      unsubscribe();
      disconnectQueryManagers();
    };
  }, []);

  return (
    <GestureHandlerRootView style={styles.flex}>
      <SafeAreaProvider>
        <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
          <ThemeProvider>
            <ErrorBoundary name="root">
              <AppShell />
            </ErrorBoundary>
          </ThemeProvider>
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});

export default App;
