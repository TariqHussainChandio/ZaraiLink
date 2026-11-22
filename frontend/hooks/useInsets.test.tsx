import React from 'react';
import { Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useInsets } from './useInsets';

function Probe() {
  return <Text>{`bottom ${useInsets().bottom}`}</Text>;
}

describe('useInsets', () => {
  it('has no insets without a provider, instead of throwing', async () => {
    await render(<Probe />);
    expect(screen.getByText('bottom 0')).toBeTruthy();
  });

  it('reads the provider when there is one', async () => {
    const metrics = { frame: { x: 0, y: 0, width: 400, height: 800 }, insets: { top: 24, left: 0, right: 0, bottom: 20 } };
    await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <Probe />
      </SafeAreaProvider>,
    );
    expect(screen.getByText('bottom 20')).toBeTruthy();
  });
});
