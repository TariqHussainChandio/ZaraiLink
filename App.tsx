import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { initLanguage } from './src/localization';
import { linking } from './src/navigation/linking';
import { RootNavigator } from './src/navigation/stacks/RootNavigator';
import { useAuthStore } from './src/store/authStore';
import { colors, darkColors, ThemeProvider, useIsDarkMode } from './src/theme';

const queryClient = new QueryClient();

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
      <RootNavigator />
    </NavigationContainer>
  );
}

function App() {
  useEffect(() => {
    const unsubscribe = useAuthStore.getState().initialize();
    initLanguage();
    return unsubscribe;
  }, []);

  return (
    <GestureHandlerRootView style={styles.flex}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <AppShell />
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});

export default App;
