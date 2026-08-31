import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { render, type RenderResult } from '@testing-library/react-native';

const Stack = createNativeStackNavigator();

/**
 * Renders a screen-level component inside a real (single-route) navigator so
 * `useNavigation`/`useFocusEffect`/`useRoute` work as they do in the app, instead of the
 * bare `render()` used for leaf UI components. `getParent()` resolves to `undefined` here
 * (no surrounding tab navigator) — call sites that chain off it are written with `?.` for
 * exactly this reason.
 */
export function renderWithProviders(ui: React.ReactElement): Promise<RenderResult> {
  return render(
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="__UnderTest__">{() => ui}</Stack.Screen>
      </Stack.Navigator>
    </NavigationContainer>,
  );
}
