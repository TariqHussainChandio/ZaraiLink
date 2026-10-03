import React from 'react';
import { Text } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { type BottomTabBarProps, createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import { House, Receipt } from 'lucide-react-native';
import { TabBar } from './TabBar';

type Tabs = { Home: undefined; Orders: undefined };
const Tab = createBottomTabNavigator<Tabs>();

function renderTabBar(props: BottomTabBarProps) {
  return <TabBar {...props} />;
}

const HOME_TAB = { title: 'Home', tabBarIcon: ({ color, size }: { color: string; size: number }) => <House color={color} size={size} /> };
const ORDERS_TAB = { title: 'Orders', tabBarIcon: ({ color, size }: { color: string; size: number }) => <Receipt color={color} size={size} /> };

function HomeScreen() {
  return <Text>Home screen</Text>;
}

function OrdersScreen() {
  return <Text>Orders screen</Text>;
}

async function renderTabs(ordersBadge?: number) {
  await render(
    <NavigationContainer>
      <Tab.Navigator tabBar={renderTabBar} screenOptions={{ headerShown: false }}>
        <Tab.Screen name="Home" component={HomeScreen} options={HOME_TAB} />
        <Tab.Screen name="Orders" component={OrdersScreen} options={{ ...ORDERS_TAB, tabBarBadge: ordersBadge }} />
      </Tab.Navigator>
    </NavigationContainer>,
  );
}

describe('TabBar', () => {
  it('shows each destination as a tab and marks the current one', async () => {
    await renderTabs();
    expect(screen.getAllByRole('tab')).toHaveLength(2);
    expect(screen.getByRole('tab', { name: 'Home' })).toBeSelected();
    expect(screen.getByRole('tab', { name: 'Orders' })).not.toBeSelected();
  });

  it('opens a destination when its tab is pressed', async () => {
    await renderTabs();
    await fireEvent.press(screen.getByRole('tab', { name: 'Orders' }));
    expect(await screen.findByText('Orders screen')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Orders' })).toBeSelected();
  });

  it('says a tab has something new when it carries a badge', async () => {
    await renderTabs(2);
    expect(screen.getByRole('tab', { name: 'Orders, new' })).toBeTruthy();
  });
});
