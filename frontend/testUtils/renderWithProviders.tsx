import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { render, type RenderResult } from '@testing-library/react-native';

const Stack = createNativeStackNavigator();

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
 * the hooks in `src/hooks/api` work; pass one in to inspect or pre-seed the cache.
 */
export function renderWithProviders(
  ui: React.ReactElement,
  queryClient: QueryClient = createTestQueryClient(),
): Promise<RenderResult> {
  return render(
    <QueryClientProvider client={queryClient}>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="__UnderTest__">{() => ui}</Stack.Screen>
        </Stack.Navigator>
      </NavigationContainer>
    </QueryClientProvider>,
  );
}

/** For components that read through the query hooks but do not need navigation (forms, filter bars, cards). */
export function renderWithQuery(ui: React.ReactElement, queryClient: QueryClient = createTestQueryClient()) {
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}
