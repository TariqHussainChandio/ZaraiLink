import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { lightTheme } from '../../theme';
import { Button } from './Button';
import { StickyActionBar } from './StickyActionBar';

const PHONE = { frame: { x: 0, y: 0, width: 400, height: 800 }, insets: { top: 24, left: 0, right: 0, bottom: 30 } };

function renderBar(tabBarHeight?: number) {
  return render(
    <SafeAreaProvider initialMetrics={PHONE}>
      <BottomTabBarHeightContext.Provider value={tabBarHeight}>
        <StickyActionBar leading={<Text>Rs 14,250</Text>}>
          <Button label="Place order" size="lg" />
        </StickyActionBar>
      </BottomTabBarHeightContext.Provider>
    </SafeAreaProvider>,
  );
}

describe('StickyActionBar', () => {
  it('holds the figure and the one primary action', async () => {
    await renderBar();
    expect(screen.getByText('Rs 14,250')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Place order' })).toBeTruthy();
  });

  it('is paper with a top hairline and elevation 1', async () => {
    await renderBar();
    const bar = screen.getByText('Rs 14,250').parent?.parent;
    const style = StyleSheet.flatten(bar?.props.style);
    expect(style.backgroundColor).toBe(lightTheme.colors.surface);
    expect(style.borderTopWidth).toBe(lightTheme.borders.hairline);
    expect(style.elevation).toBe(lightTheme.shadows.elev1.elevation);
  });

  it('clears the gesture area itself when no tab bar is under it', async () => {
    await renderBar(undefined);
    const style = StyleSheet.flatten(screen.getByText('Rs 14,250').parent?.parent?.props.style);
    expect(style.paddingBottom).toBe(lightTheme.space[3] + PHONE.insets.bottom);
  });

  it('leaves the gesture area to the tab bar inside a tab', async () => {
    await renderBar(94);
    const style = StyleSheet.flatten(screen.getByText('Rs 14,250').parent?.parent?.props.style);
    expect(style.paddingBottom).toBe(lightTheme.space[3]);
  });

  it('gives the action the whole bar when there is no figure', async () => {
    await render(
      <StickyActionBar>
        <Button label="Publish listing" size="lg" />
      </StickyActionBar>,
    );
    expect(screen.getByRole('button', { name: 'Publish listing' })).toBeTruthy();
  });
});
