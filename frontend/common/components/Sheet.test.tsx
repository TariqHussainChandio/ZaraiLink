import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { lightTheme } from '../../theme';
import { Sheet } from './Sheet';

// A phone with a 24 dp status bar and a 24 dp gesture area, as App.tsx's SafeAreaProvider measures it.
const PHONE = { frame: { x: 0, y: 0, width: 400, height: 800 }, insets: { top: 24, left: 0, right: 0, bottom: 24 } };

function renderSheet(ui: React.ReactElement) {
  return render(<SafeAreaProvider initialMetrics={PHONE}>{ui}</SafeAreaProvider>);
}

describe('Sheet', () => {
  it('renders its children when visible', async () => {
    await renderSheet(
      <Sheet visible onClose={() => {}}>
        <Text>Sheet content</Text>
      </Sheet>,
    );
    expect(screen.getByText('Sheet content')).toBeTruthy();
  });

  it('calls onClose when the backdrop is pressed', async () => {
    const onClose = jest.fn();
    await renderSheet(
      <Sheet visible onClose={onClose}>
        <Text>Sheet content</Text>
      </Sheet>,
    );
    await fireEvent.press(screen.getByTestId('sheet-backdrop', { includeHiddenElements: true }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('always offers a Close button, with or without a title (A8)', async () => {
    const onClose = jest.fn();
    await renderSheet(
      <Sheet visible onClose={onClose}>
        <Text>Filters</Text>
      </Sheet>,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    await renderSheet(
      <Sheet visible onClose={onClose} title="Delete this farm?">
        <Text>Body</Text>
      </Sheet>,
    );
    expect(screen.getByRole('header', { name: 'Delete this farm?' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Close' })).toHaveLength(1);
  });

  it('hides the full-screen backdrop from TalkBack, so Close is the one Close stop', async () => {
    await renderSheet(
      <Sheet visible onClose={() => {}} title="Filters">
        <Text>Body</Text>
      </Sheet>,
    );
    const backdrop = screen.getByTestId('sheet-backdrop', { includeHiddenElements: true });
    // Jest runs as Android.
    expect(backdrop.props.accessible).toBe(false);
    expect(backdrop.props.importantForAccessibility).toBe('no-hide-descendants');
  });

  it('scrolls a tall body, keeps a tap with the keyboard up, and stays clear of the status bar', async () => {
    await renderSheet(
      <Sheet visible onClose={() => {}} title="Filters">
        <Text>Body</Text>
      </Sheet>,
    );
    const body = screen.getByTestId('sheet-body');
    expect(body.props.scrollEnabled).not.toBe(false);
    expect(body.props.keyboardShouldPersistTaps).toBe('handled');
    expect(StyleSheet.flatten(body.props.style).flexShrink).toBe(1);

    const backdrop = screen.getByTestId('sheet-backdrop', { includeHiddenElements: true });
    expect(StyleSheet.flatten(backdrop.props.style).minHeight).toBeGreaterThan(PHONE.insets.top);
  });

  it('reaches the bottom edge and pads its content above the gesture area', async () => {
    await renderSheet(
      <Sheet visible onClose={() => {}} title="Dispatch">
        <Text>Body</Text>
      </Sheet>,
    );
    const sheet = screen.getByLabelText('Dispatch');
    expect(StyleSheet.flatten(sheet.props.style).paddingBottom).toBe(lightTheme.space[6] + PHONE.insets.bottom);
  });
});
