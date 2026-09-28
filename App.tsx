import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary, OfflineBanner } from './frontend/common/components';
import { connectQueryManagers, persistOptions, queryClient } from './frontend/hooks/queryClient';
import { linking } from './frontend/navigation/linking';
import { RootNavigator } from './frontend/navigation/stacks/RootNavigator';
import { configureGeneratedClient } from './frontend/services/api/client';
import { useAuthStore } from './frontend/state/authStore';
import { colors, darkColors, ThemeProvider, useIsDarkMode } from './frontend/theme';

// P7: the generated API client (frontend/services/api/generated) shares the app's request pipeline: session token, timeouts, retries, ApiError.
configureGeneratedClient();

// React Navigation styles its own native chrome (native-stack headers, the bottom tab bar) from
// this `theme` prop, not from `useTheme()` — screen content and the surrounding navigation
// chrome need to agree on light/dark, so this is built from the same `colors`/`darkColors` as
// everything else rather than React Navigation's own unrelated default palette.
function buildNavigationTheme(isDark: boolean) {
  const base = isDark ? DarkTheme : DefaultTheme;
  const palette = isDark ? darkColors : colors;
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: palette.brand.primary,
      background: palette.background.default,
      card: palette.background.surface,
      text: palette.text.primary,
      border: palette.border,
    },
  };
}

function AppShell() {
  const isDark = useIsDarkMode();

  return (
    <NavigationContainer linking={linking} theme={buildNavigationTheme(isDark)}>
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
