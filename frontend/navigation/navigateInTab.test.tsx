import React from 'react';
import { Text } from 'react-native';
import { createBottomTabNavigator, type BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { NavigationContainer, useNavigation, type NavigatorScreenParams } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { navigateInTab } from './navigateInTab';

type ShopStack = { Shop: undefined; Product: { id: string } };
type Tabs = { Start: undefined; Market: NavigatorScreenParams<ShopStack> | undefined };

const Tab = createBottomTabNavigator<Tabs>();
const Stack = createNativeStackNavigator<ShopStack>();

function StartScreen() {
  const tabs = useNavigation<BottomTabNavigationProp<Tabs>>();
  return <Text onPress={() => navigateInTab(tabs, 'Market', 'Product', { id: '7' })}>Open product</Text>;
}

function ShopScreen() {
  return <Text>Shop root</Text>;
}

function ProductScreen() {
  const stack = useNavigation();
  return (
    <>
      <Text>Product page</Text>
      <Text onPress={() => stack.goBack()}>Back</Text>
    </>
  );
}

function MarketTab() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Shop" component={ShopScreen} />
      <Stack.Screen name="Product" component={ProductScreen} />
    </Stack.Navigator>
  );
}

function App() {
  return (
    <NavigationContainer>
      <Tab.Navigator screenOptions={{ headerShown: false }}>
        <Tab.Screen name="Start" component={StartScreen} />
        <Tab.Screen name="Market" component={MarketTab} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

describe('navigateInTab', () => {
  it('opens the screen in the other tab with that tab\'s first screen still underneath, so Back reaches it', async () => {
    await render(<App />);
    // The Market tab has never been opened: this is the case where React Navigation would make Product its only screen.
    await fireEvent.press(screen.getByText('Open product'));
    expect(await screen.findByText('Product page')).toBeTruthy();

    await fireEvent.press(screen.getByText('Back'));
    expect(await screen.findByText('Shop root')).toBeTruthy();
  });

  it('does nothing outside the tab shell instead of throwing', () => {
    expect(() => navigateInTab<Tabs, 'Market', 'Product'>(undefined, 'Market', 'Product', { id: '7' })).not.toThrow();
  });
});
