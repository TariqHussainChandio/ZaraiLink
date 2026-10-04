import React from 'react';
import { act, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useNetworkStore } from '../../state/networkStore';
import { OfflineBanner } from './OfflineBanner';

// Insets as on a phone with a 24 dp status bar; the app provides them from App.tsx's SafeAreaProvider.
const METRICS = { frame: { x: 0, y: 0, width: 400, height: 800 }, insets: { top: 24, left: 0, right: 0, bottom: 0 } };

function renderInsets(ui: React.ReactElement) {
  return render(<SafeAreaProvider initialMetrics={METRICS}>{ui}</SafeAreaProvider>);
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
    expect(screen.getByText(/Showing what was saved on this phone/)).toBeTruthy();
  });
});
