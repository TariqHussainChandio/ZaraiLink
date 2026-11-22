import { render, screen } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { SafeAreaInsetsContext, SafeAreaProvider } from 'react-native-safe-area-context';
import { useAuthStore } from '../../state/authStore';
import { InventoryGate } from './InventoryGate';

const PHONE = { frame: { x: 0, y: 0, width: 400, height: 800 }, insets: { top: 24, left: 0, right: 0, bottom: 24 } };

/** The refusal screen's outer view: the parent chain of its title up to the one with the safe-area padding. */
function paddingTop(): number | undefined {
  let node = screen.getByText('Inventory Management is for approved dealers').parent;
  while (node) {
    const top = StyleSheet.flatten(node.props.style)?.paddingTop;
    if (top !== undefined) return top as number;
    node = node.parent;
  }
  return undefined;
}

beforeEach(() => {
  useAuthStore.setState({ status: 'authenticated', role: 'farmer', user: { id: 'u' } as never, profile: null });
});

describe('InventoryGate insets (B4 verification F4)', () => {
  it('pads by the status bar normally', async () => {
    await render(
      <SafeAreaProvider initialMetrics={PHONE}>
        <InventoryGate onExit={jest.fn()}>
          <Text>stock</Text>
        </InventoryGate>
      </SafeAreaProvider>,
    );
    expect(paddingTop()).toBe(24);
    expect(screen.queryByText('stock')).toBeNull();
  });

  it('adds no second gap when OfflineBanner reports the top as taken', async () => {
    await render(
      <SafeAreaProvider initialMetrics={PHONE}>
        <SafeAreaInsetsContext.Provider value={{ ...PHONE.insets, top: 0 }}>
          <InventoryGate onExit={jest.fn()}>
            <Text>stock</Text>
          </InventoryGate>
        </SafeAreaInsetsContext.Provider>
      </SafeAreaProvider>,
    );
    expect(paddingTop()).toBe(0);
  });
});
