import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Bell } from 'lucide-react-native';
import { rippleOf } from '../../testUtils/ripple';
import { lightTheme } from '../../theme';
import { IconButton, TopAppBar } from './TopAppBar';

// Insets as on a phone with a 24 dp status bar; the app provides them from App.tsx's SafeAreaProvider.
const METRICS = { frame: { x: 0, y: 0, width: 400, height: 800 }, insets: { top: 24, left: 0, right: 0, bottom: 0 } };

function renderInsets(ui: React.ReactElement) {
  return render(<SafeAreaProvider initialMetrics={METRICS}>{ui}</SafeAreaProvider>);
}

describe('TopAppBar', () => {
  it('names the screen as a header and offers back only when it has somewhere to go', async () => {
    const onBack = jest.fn();
    await renderInsets(<TopAppBar title="Order ZL-24817" onBack={onBack} />);
    expect(screen.getByRole('header', { name: 'Order ZL-24817' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledTimes(1);

    await renderInsets(<TopAppBar title="Orders" />);
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
  });

  it('sits below the status bar', async () => {
    await renderInsets(<TopAppBar title="Orders" />);
    const bar = screen.getByRole('header', { name: 'Orders' }).parent?.parent?.parent;
    expect(StyleSheet.flatten(bar?.props.style).paddingTop).toBe(METRICS.insets.top);
  });

  it('sets a tab root in the large headline with its subtitle', async () => {
    await renderInsets(<TopAppBar title="Good morning, Aslam" subtitle="Multan · 3 orders need you" variant="large" />);
    expect(screen.getByRole('header', { name: 'Good morning, Aslam' })).toBeTruthy();
    expect(screen.getByText('Multan · 3 orders need you')).toBeTruthy();
  });

  it('marks every inventory-system screen as the separate system (SRDS §15)', async () => {
    await renderInsets(<TopAppBar title="Stock" variant="inventory" onBack={() => undefined} />);
    expect(screen.getByText('Inventory system')).toBeTruthy();
  });

  it("sets an inner screen's title in the board face at title-bar size, and a tab root's in the large headline", async () => {
    await renderInsets(<TopAppBar title="Order ZL-24817" onBack={() => undefined} />);
    const inner = StyleSheet.flatten(screen.getByRole('header', { name: 'Order ZL-24817' }).props.style);
    expect(inner.fontFamily).toBe(lightTheme.typography.titleBar.fontFamily);
    expect(inner.fontSize).toBe(lightTheme.typography.titleBar.fontSize);
    await renderInsets(<TopAppBar title="Market" variant="large" />);
    const large = StyleSheet.flatten(screen.getByRole('header', { name: 'Market' }).props.style);
    expect(large.fontFamily).toBe(lightTheme.typography.headline.fontFamily);
    expect(large.fontSize).toBe(lightTheme.typography.headline.fontSize);
  });

  it('writes the inventory kicker in sentence case, bold, in the dealer ink', async () => {
    await renderInsets(<TopAppBar title="Stock" variant="inventory" onBack={() => undefined} />);
    const kicker = StyleSheet.flatten(screen.getByText('Inventory system').props.style);
    expect(kicker.color).toBe(lightTheme.colors.accent.dealer.ink);
    expect(kicker.fontWeight).toBe(lightTheme.fontWeight.bold);
    expect(kicker.textTransform).toBeUndefined();
  });

  it('shows the actions and the element a screen supplies', async () => {
    const onPress = jest.fn();
    await renderInsets(<TopAppBar title="Home" actions={[{ icon: Bell, label: 'Notifications', onPress }]} right={<IconButton icon={Bell} label="Messages" onPress={() => undefined} />} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Notifications' }));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Messages' })).toBeTruthy();
  });
});

describe('IconButton', () => {
  it('is a 48 dp target with a spoken label', async () => {
    await render(<IconButton icon={Bell} label="Notifications" onPress={() => undefined} />);
    const style = StyleSheet.flatten(screen.getByRole('button', { name: 'Notifications' }).props.style);
    expect(style.width).toBe(lightTheme.size.touchMin);
    expect(style.height).toBe(lightTheme.size.touchMin);
  });

  it('ripples as a round disc when pressed, which it did not before', async () => {
    await render(<IconButton icon={Bell} label="Notifications" onPress={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Notifications' }).props.nativeBackgroundAndroid).toEqual(
      rippleOf(lightTheme.colors.ripple, { borderless: true, rippleRadius: lightTheme.size.touchMin / 2 }),
    );
  });

  it('speaks and shows its count, capped at 99+', async () => {
    await render(<IconButton icon={Bell} label="Notifications" count={3} onPress={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Notifications, 3 unread' })).toBeTruthy();
    await render(<IconButton icon={Bell} label="Notifications" count={140} onPress={() => undefined} />);
    expect(screen.getByText('99+')).toBeTruthy();
  });

  it('says what its count counts when that is not unread notifications', async () => {
    await render(<IconButton icon={Bell} label="Cart" count={2} countLabel={n => `${n} items`} onPress={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Cart, 2 items' })).toBeTruthy();
  });
});
