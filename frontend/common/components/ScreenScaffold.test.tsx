import React from 'react';
import { StyleSheet, Text } from 'react-native';
import type { ReactTestRendererJSON } from 'react-test-renderer';
import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import { render, screen, within } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { lightTheme } from '../../theme';
import { ScreenScaffold } from './ScreenScaffold';

const PHONE = { frame: { x: 0, y: 0, width: 400, height: 800 }, insets: { top: 24, left: 0, right: 0, bottom: 30 } };

function renderScreen(ui: React.ReactElement, tabBarHeight?: number) {
  return render(
    <SafeAreaProvider initialMetrics={PHONE}>
      <BottomTabBarHeightContext.Provider value={tabBarHeight}>{ui}</BottomTabBarHeightContext.Provider>
    </SafeAreaProvider>,
  );
}

type Json = ReactTestRendererJSON | ReactTestRendererJSON[] | null;

/** Whether a pull-to-refresh control is anywhere in the rendered tree. */
function hasRefreshControl(node: Json): boolean {
  if (!node) return false;
  if (Array.isArray(node)) return node.some(hasRefreshControl);
  if (node.type === 'RCTRefreshControl') return true;
  return (node.children ?? []).some(child => typeof child !== 'string' && hasRefreshControl(child));
}

describe('ScreenScaffold', () => {
  it('paints the field, never the paper, behind its content', async () => {
    await renderScreen(
      <ScreenScaffold testID="screen">
        <Text>Content</Text>
      </ScreenScaffold>,
    );
    expect(StyleSheet.flatten(screen.getByTestId('screen').props.style).backgroundColor).toBe(lightTheme.colors.ground);
  });

  it('scrolls, and keeps taps on buttons while a field is focused', async () => {
    await renderScreen(
      <ScreenScaffold testID="screen">
        <Text>Content</Text>
      </ScreenScaffold>,
    );
    const scroll = screen.getByTestId('screen-scroll');
    expect(scroll.props.keyboardShouldPersistTaps).toBe('handled');
    expect(within(scroll).getByText('Content')).toBeTruthy();
  });

  it('puts the footer below the content, outside the scroll, so nothing scrolls behind it', async () => {
    await renderScreen(
      <ScreenScaffold testID="screen" footer={<Text>Place order bar</Text>}>
        <Text>Content</Text>
      </ScreenScaffold>,
    );
    expect(within(screen.getByTestId('screen-scroll')).queryByText('Place order bar')).toBeNull();
    expect(screen.getByText('Place order bar')).toBeTruthy();
  });

  it('adds pull-to-refresh only when asked', async () => {
    await renderScreen(
      <ScreenScaffold testID="screen" onRefresh={() => undefined}>
        <Text>Content</Text>
      </ScreenScaffold>,
    );
    expect(hasRefreshControl(screen.toJSON())).toBe(true);
    await renderScreen(
      <ScreenScaffold testID="plain">
        <Text>Content</Text>
      </ScreenScaffold>,
    );
    expect(hasRefreshControl(screen.toJSON())).toBe(false);
  });

  it('caps the content at the tablet width and centres it', async () => {
    await renderScreen(
      <ScreenScaffold>
        <Text>Content</Text>
      </ScreenScaffold>,
    );
    const column = screen.getByText('Content').parent;
    const style = StyleSheet.flatten(column?.props.style);
    expect(style.maxWidth).toBe(lightTheme.size.contentMax);
    expect(style.gap).toBe(lightTheme.components.screen.sectionGap);
  });

  it('lets a list-screen skip the scroll view and still fill the screen', async () => {
    await renderScreen(
      <ScreenScaffold scroll={false}>
        <Text>Own list</Text>
      </ScreenScaffold>,
    );
    expect(screen.getByText('Own list')).toBeTruthy();
    const column = screen.getByText('Own list').parent;
    expect(StyleSheet.flatten(column?.props.style).maxWidth).toBe(lightTheme.size.contentMax);
  });

  it('clears the gesture area itself when there is no tab bar and no footer', async () => {
    await renderScreen(
      <ScreenScaffold scroll={false} testID="screen">
        <Text>Own list</Text>
      </ScreenScaffold>,
    );
    const wrapper = screen.getByText('Own list').parent?.parent;
    expect(StyleSheet.flatten(wrapper?.props.style).paddingBottom).toBe(PHONE.insets.bottom);
  });

  it('leaves the gesture area to the tab bar inside a tab', async () => {
    await renderScreen(
      <ScreenScaffold scroll={false}>
        <Text>Own list</Text>
      </ScreenScaffold>,
      94,
    );
    const wrapper = screen.getByText('Own list').parent?.parent;
    expect(StyleSheet.flatten(wrapper?.props.style).paddingBottom).toBe(0);
  });

  it('keeps the screen margin on both sides', async () => {
    await renderScreen(
      <ScreenScaffold scroll={false}>
        <Text>Own list</Text>
      </ScreenScaffold>,
    );
    const wrapper = screen.getByText('Own list').parent?.parent;
    const style = StyleSheet.flatten(wrapper?.props.style);
    expect(style.paddingLeft).toBe(lightTheme.components.screen.margin);
    expect(style.paddingRight).toBe(lightTheme.components.screen.margin);
  });
});
