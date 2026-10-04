import React from 'react';
import { Text } from 'react-native';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { NavigationContainer, useNavigation, type ParamListBase } from '@react-navigation/native';
import { createNativeStackNavigator, type NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { typography } from '../theme';
import { stackScreenOptions } from './stackHeader';

// The app's own header for every stack: the tab root has the large title and no Back, an inner screen has Back, and
// headerBackVisible: false (a screen mid-flow, such as paying) has no Back, as the native header behaved.
const Stack = createNativeStackNavigator();
const PHONE = { frame: { x: 0, y: 0, width: 400, height: 800 }, insets: { top: 24, left: 0, right: 0, bottom: 24 } };

function Go({ to }: { to: string }) {
  const navigation = useNavigation<NativeStackNavigationProp<ParamListBase>>();
  return <Text onPress={() => navigation.navigate(to)}>{`Open ${to}`}</Text>;
}

const FirstScreen = () => <Go to="Paying" />;
const PayingScreen = () => <Go to="Receipt" />;
const ReceiptScreen = () => null;

async function renderStack() {
  await render(
    <SafeAreaProvider initialMetrics={PHONE}>
      <NavigationContainer>
        <Stack.Navigator screenOptions={stackScreenOptions}>
          <Stack.Screen name="First" component={FirstScreen} options={{ title: 'Orders' }} />
          <Stack.Screen name="Paying" component={PayingScreen} options={{ title: 'Payment', headerBackVisible: false }} />
          <Stack.Screen name="Receipt" component={ReceiptScreen} options={{ title: 'Receipt' }} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>,
  );
}

// A stack opened full screen over the tabs (farmers' and buyers' Messages) starts with no history of its own; its first
// screen's Back closes it.
const Root = createNativeStackNavigator();
const Overlay = createNativeStackNavigator();
const TabsScreen = () => <Go to="Messages" />;
const ConversationsScreen = () => null;
function MessagesStack() {
  return (
    <Overlay.Navigator screenOptions={stackScreenOptions}>
      <Overlay.Screen name="Conversations" component={ConversationsScreen} options={{ title: 'Messages' }} />
    </Overlay.Navigator>
  );
}

describe('stack header over the tabs', () => {
  it('gives the first screen of a full-screen stack a Back that closes it', async () => {
    await render(
      <SafeAreaProvider initialMetrics={PHONE}>
        <NavigationContainer>
          <Root.Navigator screenOptions={{ headerShown: false }}>
            <Root.Screen name="Tabs" component={TabsScreen} />
            <Root.Screen name="Messages" component={MessagesStack} />
          </Root.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>,
    );
    await fireEvent.press(screen.getByText('Open Messages'));
    expect(await screen.findByRole('header', { name: 'Messages' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByText('Open Messages')).toBeTruthy();
    expect(screen.queryByRole('header', { name: 'Messages' })).toBeNull();
  });
});

describe('stack header', () => {
  it('gives the first screen the large title and no Back', async () => {
    await renderStack();
    expect(screen.getByRole('header', { name: 'Orders' })).toHaveStyle({ fontSize: typography.headline.fontSize });
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
  });

  it('hides Back on a screen that asks for it, and shows it on the next inner screen', async () => {
    await renderStack();
    await fireEvent.press(screen.getByText('Open Paying'));
    expect(await screen.findByRole('header', { name: 'Payment' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();

    await fireEvent.press(await screen.findByText('Open Receipt'));
    expect(await screen.findByRole('header', { name: 'Receipt' })).toHaveStyle({ fontSize: typography.title.fontSize });
    expect(screen.getAllByRole('button', { name: 'Back' }).length).toBeGreaterThan(0);
  });
});
