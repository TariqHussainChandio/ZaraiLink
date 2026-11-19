import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { act, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useInsets } from '../../hooks/useInsets';
import { useNetworkStore } from '../../state/networkStore';
import { OfflineBanner, OfflineFrame } from './OfflineBanner';

// Insets as on a phone with a 24 dp status bar; the app provides them from App.tsx's SafeAreaProvider.
const METRICS = { frame: { x: 0, y: 0, width: 400, height: 800 }, insets: { top: 24, left: 0, right: 0, bottom: 0 } };

function renderInsets(ui: React.ReactElement) {
  return render(<SafeAreaProvider initialMetrics={METRICS}>{ui}</SafeAreaProvider>);
}

afterEach(() => useNetworkStore.setState({ isOffline: false }));

describe('OfflineBanner', () => {
  it('shows nothing while the app is online', async () => {
    await renderInsets(<OfflineBanner />);
    expect(screen.queryByText('No connection')).toBeNull();
  });

  it('says what is wrong and what still works, in words that are true on a form as well as on a list', async () => {
    await renderInsets(<OfflineBanner />);
    await act(async () => useNetworkStore.getState().setOffline(true));
    expect(screen.getByText('No connection')).toBeTruthy();
    expect(screen.getByText(/changes can't be saved until you are back online/)).toBeTruthy();
    // It used to claim "Showing what was saved on this phone", which is false on a form.
    expect(screen.queryByText(/Showing what was saved/)).toBeNull();
  });

  it('is part of the layout, not drawn over the screen, so it cannot cover an app bar or Back', async () => {
    useNetworkStore.setState({ isOffline: true });
    await renderInsets(<OfflineBanner />);
    const wrap = screen.getByText('No connection').parent?.parent?.parent?.parent?.parent;
    const style = StyleSheet.flatten(wrap?.props.style);
    expect(style.position).toBeUndefined();
    expect(style.zIndex).toBeUndefined();
  });
});

function TopInset() {
  return <Text>{`top ${useInsets().top}`}</Text>;
}

describe('OfflineFrame', () => {
  it('shows the app, with the banner above it while offline', async () => {
    useNetworkStore.setState({ isOffline: true });
    await renderInsets(
      <OfflineFrame>
        <Text>The app</Text>
      </OfflineFrame>,
    );
    expect(screen.getByText('No connection')).toBeTruthy();
    expect(screen.getByText('The app')).toBeTruthy();
  });

  it('tells the app below the banner that the status bar is already cleared, so no app bar pads for it twice', async () => {
    await renderInsets(
      <OfflineFrame>
        <TopInset />
      </OfflineFrame>,
    );
    expect(screen.getByText('top 24')).toBeTruthy();
    await act(async () => useNetworkStore.getState().setOffline(true));
    expect(screen.getByText('top 0')).toBeTruthy();
    await act(async () => useNetworkStore.getState().setOffline(false));
    expect(screen.getByText('top 24')).toBeTruthy();
  });

  it('does not remount the app when the connection drops, which would lose every screen\'s state', async () => {
    let mounts = 0;
    function Counter() {
      React.useEffect(() => {
        mounts += 1;
      }, []);
      return <Text>The app</Text>;
    }
    await renderInsets(
      <OfflineFrame>
        <Counter />
      </OfflineFrame>,
    );
    await act(async () => useNetworkStore.getState().setOffline(true));
    await act(async () => useNetworkStore.getState().setOffline(false));
    expect(mounts).toBe(1);
  });
});
