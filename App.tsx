// The app's root component: sets up providers, auth, cache and navigation.
import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
} from '@react-navigation/native';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import React, { useEffect } from 'react';
import { StatusBar, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary, OfflineFrame, SnackbarProvider, ToastProvider } from './frontend/common/components';
import { connectQueryManagers, persistOptions, queryClient } from './frontend/hooks/queryClient';
import { linking } from './frontend/navigation/linking';
import { RootNavigator } from './frontend/navigation/stacks/RootNavigator';
import { configureGeneratedClient } from './frontend/services/api/client';
import { useAuthStore } from './frontend/state/authStore';
import { connectCartToAuth } from './frontend/state/cartStore';
import { connectCheckoutIntentToAuth } from './frontend/state/checkoutIntentStore';
import { connectMarketplaceToAuth } from './frontend/state/marketplaceStore';
import {
  darkColors,
  lightColors,
  ThemeProvider,
  useIsDarkMode,
} from './frontend/theme';

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

// Holds the navigation container, status bar, offline banner and the root navigator.
function AppShell() {
  const isDark = useIsDarkMode();

  return (
    <NavigationContainer linking={linking} theme={buildNavigationTheme(isDark)}>
      {/* Light icons by default: every app bar and the splash are olive (D20). The light sign-in pages switch them to dark
          while they are in front (useStatusBarStyle), following the app's own light/dark choice, not the phone's. */}
      <StatusBar barStyle="light-content" />
      {/* The offline banner is part of the layout, above the navigator, so it never covers an app bar or Back. */}
      <OfflineFrame>
        <RootNavigator />
      </OfflineFrame>
    </NavigationContainer>
  );
}

// Root component: starts auth and store listeners, then mounts every app-wide provider.
function App() {
  useEffect(() => {
    const unsubscribe = useAuthStore.getState().initialize();
    const disconnectQueryManagers = connectQueryManagers();
    // The cart is saved on the device; it follows its owner so the next account on the phone starts empty.
    const disconnectCart = connectCartToAuth();
    const disconnectFilters = connectMarketplaceToAuth();
    // A guest's "Go to checkout" survives the sign-in that follows, and is forgotten for an account that cannot buy.
    const disconnectCheckoutIntent = connectCheckoutIntentToAuth();
    return () => {
      unsubscribe();
      disconnectQueryManagers();
      disconnectCart();
      disconnectFilters();
      disconnectCheckoutIntent();
    };
  }, []);

  return (
    <GestureHandlerRootView style={styles.flex}>
      <SafeAreaProvider>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={persistOptions}
        >
          <ThemeProvider>
            {/* Inside the theme (its colours) and the safe area (its place above the tab bar), outside the error
                boundary so a message raised just before a crash is not lost with the screen. Toast carries a status
                (saved, failed); the snackbar carries a message with an action (Undo). Both sit above navigation, so
                either can confirm an action on whichever screen is open. */}
            <ToastProvider>
              <SnackbarProvider>
                <ErrorBoundary name="root">
                  <AppShell />
                </ErrorBoundary>
              </SnackbarProvider>
            </ToastProvider>
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
