import React from 'react';
import { act, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { useNetworkStore } from '../../state/networkStore';
import { OfflineBanner } from './OfflineBanner';

// Insets as on a phone with a 24 dp status bar; the app provides them from App.tsx's SafeAreaProvider.
const METRICS = {
  frame: { x: 0, y: 0, width: 400, height: 800 },
  insets: { top: 24, left: 0, right: 0, bottom: 0 },
};

function renderInsets(ui: React.ReactElement) {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>{ui}</SafeAreaProvider>,
  );
}

afterEach(() => useNetworkStore.setState({ isOffline: false }));

describe('OfflineBanner', () => {
  it('shows nothing while the app is online', async () => {
    await renderInsets(<OfflineBanner />);
    expect(screen.queryByText('You are offline')).toBeNull();
  });

  it('says the app is offline, and that saved data is still shown, when a request cannot reach the network', async () => {
    await renderInsets(<OfflineBanner />);
    await act(async () => useNetworkStore.getState().setOffline(true));
    expect(screen.getByText('You are offline')).toBeTruthy();
    expect(
      screen.getByText(/Showing what was saved on this phone/),
    ).toBeTruthy();
  });

  it('takes its own place above the screens, which then add no second status-bar gap, and keeps them mounted', async () => {
    let mounts = 0;
    function Screen() {
      const { top } = useSafeAreaInsets();
      React.useEffect(() => {
        mounts += 1;
      }, []);
      return <Text>{`top inset ${top}`}</Text>;
    }
    await renderInsets(
      <OfflineBanner>
        <Screen />
      </OfflineBanner>,
    );
    expect(screen.getByText('top inset 24')).toBeTruthy();

    await act(async () => useNetworkStore.getState().setOffline(true));
    expect(screen.getByText('You are offline')).toBeTruthy();
    expect(screen.getByText('top inset 0')).toBeTruthy();

    await act(async () => useNetworkStore.getState().setOffline(false));
    expect(screen.getByText('top inset 24')).toBeTruthy();
    // Going offline and back never remounted the screen, so navigation keeps its place.
    expect(mounts).toBe(1);
  });
});
