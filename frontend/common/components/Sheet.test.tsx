import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { lightTheme } from '../../theme';
import { Sheet } from './Sheet';

// A phone with a 24 dp status bar and a 30 dp gesture area.
const PHONE = { frame: { x: 0, y: 0, width: 400, height: 800 }, insets: { top: 24, left: 0, right: 0, bottom: 30 } };

describe('Sheet', () => {
  it('renders its children when visible', async () => {
    await render(
      <Sheet visible onClose={() => {}}>
        <Text>Sheet content</Text>
      </Sheet>,
    );
    expect(screen.getByText('Sheet content')).toBeTruthy();
  });

  it('renders nothing when it is not visible', async () => {
    await render(
      <Sheet visible={false} onClose={() => {}} title="Adjust stock">
        <Text>Sheet content</Text>
      </Sheet>,
    );
    expect(screen.queryByText('Sheet content')).toBeNull();
  });

  it('has a backdrop that is a labelled button, and calls onClose when it is pressed', async () => {
    const onClose = jest.fn();
    await render(
      <Sheet visible onClose={onClose} title="Adjust stock">
        <Text>Sheet content</Text>
      </Sheet>,
    );
    const backdrop = screen.getByTestId('sheet-backdrop', { includeHiddenElements: true });
    expect(backdrop.props.accessibilityRole).toBe('button');
    expect(backdrop.props.accessibilityLabel).toBe('Close Adjust stock');
    await fireEvent.press(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('names the dialog with a header and adds a close button', async () => {
    const onClose = jest.fn();
    await render(
      <Sheet visible onClose={onClose} title="Adjust stock">
        <Text>Sheet content</Text>
      </Sheet>,
    );
    expect(screen.getByRole('header', { name: 'Adjust stock' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('scrolls its body, so a long form never pushes the footer off a small phone', async () => {
    await render(
      <Sheet visible onClose={() => {}} title="Filters" footer={<Text>Footer</Text>}>
        <Text>Long body</Text>
      </Sheet>,
    );
    const scroll = screen.getByTestId('sheet-body');
    // Taps on buttons still count while a field in the sheet has the keyboard open.
    expect(scroll.props.keyboardShouldPersistTaps).toBe('handled');
    expect(within(scroll).getByText('Long body')).toBeTruthy();
  });

  it('keeps the footer outside the scrolling body, so it stays in view above the keyboard', async () => {
    await render(
      <Sheet visible onClose={() => {}} title="Filters" footer={<Text>Apply filters</Text>}>
        <Text>Long body</Text>
      </Sheet>,
    );
    expect(within(screen.getByTestId('sheet-body')).queryByText('Apply filters')).toBeNull();
    expect(screen.getByText('Apply filters')).toBeTruthy();
  });

  it('stops at 90% of the window', async () => {
    await render(
      <Sheet visible onClose={() => {}} title="Filters">
        <Text>Body</Text>
      </Sheet>,
    );
    const sheet = screen.getByText('Body').parent?.parent?.parent;
    expect(StyleSheet.flatten(sheet?.props.style).maxHeight).toBe(lightTheme.components.sheet.maxHeight);
    expect(lightTheme.components.sheet.maxHeight).toBe('90%');
  });

  it('can leave scrolling to a body that scrolls itself, such as a list', async () => {
    await render(
      <Sheet visible onClose={() => {}} title="Choose" scroll={false}>
        <Text>Own list</Text>
      </Sheet>,
    );
    expect(screen.queryByTestId('sheet-body')).toBeNull();
    expect(screen.getByText('Own list')).toBeTruthy();
  });

  it('keeps its bottom clear of the gesture area', async () => {
    await render(
      <SafeAreaProvider initialMetrics={PHONE}>
        <Sheet visible onClose={() => {}} title="Filters" footer={<Text>Apply</Text>}>
          <Text>Body</Text>
        </Sheet>
      </SafeAreaProvider>,
    );
    const sheet = screen.getByText('Apply').parent?.parent;
    expect(StyleSheet.flatten(sheet?.props.style).paddingBottom).toBe(PHONE.insets.bottom);
  });
});
