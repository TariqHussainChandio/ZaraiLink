import React from 'react';
import { renderHook } from '@testing-library/react-native';
import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { lightTheme } from '../theme';
import { useComposerInsets } from './useComposerInsets';

const PHONE = { frame: { x: 0, y: 0, width: 400, height: 800 }, insets: { top: 24, left: 0, right: 0, bottom: 30 } };

function wrapper(tabBarHeight: number | undefined) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <SafeAreaProvider initialMetrics={PHONE}>
        <BottomTabBarHeightContext.Provider value={tabBarHeight}>{children}</BottomTabBarHeightContext.Provider>
      </SafeAreaProvider>
    );
  };
}

describe('useComposerInsets', () => {
  it('clears the gesture area itself on a screen opened full screen over the tabs', async () => {
    const { result } = await renderHook(() => useComposerInsets(), { wrapper: wrapper(undefined) });
    expect(result.current.bottom).toBe(PHONE.insets.bottom);
  });

  it('leaves the gesture area to the tab bar inside a tab', async () => {
    const { result } = await renderHook(() => useComposerInsets(), { wrapper: wrapper(80) });
    expect(result.current.bottom).toBe(0);
  });

  it('offsets the keyboard by the status bar and the app bar', async () => {
    const { result } = await renderHook(() => useComposerInsets(), { wrapper: wrapper(undefined) });
    expect(result.current.keyboardOffset).toBe(PHONE.insets.top + lightTheme.size.appBar);
  });
});
