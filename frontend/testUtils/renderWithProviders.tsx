import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { render, type RenderResult } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

const Stack = createNativeStackNavigator();

// The app renders everything inside App.tsx's SafeAreaProvider; tests get one too, measured like a phone with a 24 dp
// status bar and a 24 dp gesture area, so app bars and bottom-fixed controls lay out as they do on a device.
const PHONE = { frame: { x: 0, y: 0, width: 400, height: 800 }, insets: { top: 24, left: 0, right: 0, bottom: 24 } };

/**
 * A query client for tests: no retries (a failure should fail the test, not wait), and nothing cached between tests.
 * `gcTime: Infinity` for queries and mutations means no garbage-collection timer is scheduled when a component
 * unmounts; the default (5 minutes) kept Jest's process alive after the last test when it ran in one process (CI).
 */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } },
  });
}

/**
 * Renders a screen-level component inside a real (single-route) navigator so
 * `useNavigation`/`useFocusEffect`/`useRoute` work as they do in the app, instead of the
 * bare `render()` used for leaf UI components. `getParent()` resolves to `undefined` here
 * (no surrounding tab navigator) — call sites that chain off it are written with `?.` for
 * exactly this reason. It also provides a fresh React Query client, so screens that read through
 * the React Query hooks in each module's `hooks/` work; pass one in to inspect or pre-seed the cache.
 */
export function renderWithProviders(
  ui: React.ReactElement,
  queryClient: QueryClient = createTestQueryClient(),
): Promise<RenderResult> {
  return render(
    <SafeAreaProvider initialMetrics={PHONE}>
      <QueryClientProvider client={queryClient}>
        <NavigationContainer>
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="__UnderTest__">{() => ui}</Stack.Screen>
          </Stack.Navigator>
        </NavigationContainer>
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

/** For components that read through the query hooks but do not need navigation (forms, filter bars, cards). */
export function renderWithQuery(ui: React.ReactElement, queryClient: QueryClient = createTestQueryClient()) {
  return render(
    <SafeAreaProvider initialMetrics={PHONE}>
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
    </SafeAreaProvider>,
  );
}
