import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { lightTheme } from '../../theme';
import { Snackbar, SnackbarProvider, useSnackbar } from './Snackbar';

const PHONE = { frame: { x: 0, y: 0, width: 400, height: 800 }, insets: { top: 24, left: 0, right: 0, bottom: 30 } };

function ShowButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="Show">
      <Text>Show</Text>
    </Pressable>
  );
}

function Trigger({ message = 'Listing published', withAction = false, onAction = () => undefined }: { message?: string; withAction?: boolean; onAction?: () => void }) {
  const snackbar = useSnackbar();
  return <ShowButton onPress={() => snackbar.show(message, withAction ? { label: 'View', onPress: onAction } : undefined)} />;
}

function renderApp(ui: React.ReactElement, tabBarHeight?: number) {
  return render(
    <SafeAreaProvider initialMetrics={PHONE}>
      <BottomTabBarHeightContext.Provider value={tabBarHeight}>
        <SnackbarProvider>{ui}</SnackbarProvider>
      </BottomTabBarHeightContext.Provider>
    </SafeAreaProvider>,
  );
}

describe('Snackbar', () => {
  it('shows what happened, on the ink ground in surface text', async () => {
    await render(<Snackbar message="Listing published" />);
    expect(screen.getByText('Listing published')).toBeTruthy();
    expect(StyleSheet.flatten(screen.getByText('Listing published').props.style).color).toBe(lightTheme.colors.surface);
    expect(StyleSheet.flatten(screen.getByText('Listing published').parent?.props.style).backgroundColor).toBe(lightTheme.colors.ink);
  });

  it('is announced politely', async () => {
    await render(<Snackbar message="Listing published" />);
    expect(screen.getByText('Listing published').parent?.props.accessibilityLiveRegion).toBe('polite');
  });

  it('shows its one follow-up as a bold underlined action', async () => {
    const onPress = jest.fn();
    await render(<Snackbar message="Listing published" action={{ label: 'View', onPress }} />);
    const label = StyleSheet.flatten(screen.getByText('View').props.style);
    expect(label.textDecorationLine).toBe('underline');
    await fireEvent.press(screen.getByRole('button', { name: 'View' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('SnackbarProvider and useSnackbar', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('shows the message a screen asks for, then takes it away after 6 seconds', async () => {
    await renderApp(<Trigger />);
    await fireEvent.press(screen.getByRole('button', { name: 'Show' }));
    expect(screen.getByText('Listing published')).toBeTruthy();
    await act(async () => jest.advanceTimersByTime(lightTheme.components.snackbar.duration.message - 100));
    expect(screen.getByText('Listing published')).toBeTruthy();
    await act(async () => jest.advanceTimersByTime(200));
    expect(screen.queryByText('Listing published')).toBeNull();
  });

  it('stays longer when there is an action to read and reach', async () => {
    await renderApp(<Trigger withAction />);
    await fireEvent.press(screen.getByRole('button', { name: 'Show' }));
    await act(async () => jest.advanceTimersByTime(lightTheme.components.snackbar.duration.message + 100));
    expect(screen.getByText('Listing published')).toBeTruthy();
    await act(async () => jest.advanceTimersByTime(lightTheme.components.snackbar.duration.withAction));
    expect(screen.queryByText('Listing published')).toBeNull();
    expect(lightTheme.components.snackbar.duration.withAction).toBeGreaterThan(lightTheme.components.snackbar.duration.message);
  });

  it('runs the action and closes', async () => {
    const onAction = jest.fn();
    await renderApp(<Trigger withAction onAction={onAction} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Show' }));
    await fireEvent.press(screen.getByRole('button', { name: 'View' }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Listing published')).toBeNull();
  });

  it('replaces the message on screen with the newest, and gives the newest its own full time', async () => {
    function Two() {
      const snackbar = useSnackbar();
      return (
        <>
          <ShowButton onPress={() => snackbar.show('First')} />
          <ShowButton onPress={() => snackbar.show('Second')} />
        </>
      );
    }
    await renderApp(<Two />);
    const [first, second] = screen.getAllByRole('button', { name: 'Show' });
    if (!first || !second) throw new Error('missing triggers');
    await fireEvent.press(first);
    await act(async () => jest.advanceTimersByTime(4000));
    await fireEvent.press(second);
    expect(screen.queryByText('First')).toBeNull();
    await act(async () => jest.advanceTimersByTime(4000));
    expect(screen.getByText('Second')).toBeTruthy();
  });

  it('sits above the gesture area where there is no tab bar', async () => {
    await renderApp(<Trigger />);
    await fireEvent.press(screen.getByRole('button', { name: 'Show' }));
    const slot = screen.getByText('Listing published').parent?.parent;
    expect(StyleSheet.flatten(slot?.props.style).paddingBottom).toBe(PHONE.insets.bottom);
  });

  it('sits above the tab bar when the calling screen is inside one', async () => {
    await renderApp(<Trigger />, 94);
    await fireEvent.press(screen.getByRole('button', { name: 'Show' }));
    const slot = screen.getByText('Listing published').parent?.parent;
    expect(StyleSheet.flatten(slot?.props.style).paddingBottom).toBe(94);
  });

  it('refuses to be used without a provider, instead of silently showing nothing', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(render(<Trigger />)).rejects.toThrow(/SnackbarProvider/);
    error.mockRestore();
  });
});
