import React from 'react';
import { AccessibilityInfo, Pressable, Text } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../testUtils/renderWithProviders';
import { useToast } from './Toast';

/** A screen with one button per kind of toast, as a real screen would call them. */
function Caller() {
  const toast = useToast();
  return (
    <>
      <Pressable accessibilityRole="button" onPress={() => toast.success('Product saved')}>
        <Text>Save</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => toast.error('Product not saved. Check your connection.')}>
        <Text>Fail</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => toast.info('Stock synced from the marketplace')}>
        <Text>Sync</Text>
      </Pressable>
    </>
  );
}

/** The nearest container of a message that is a live region: the toast itself. */
function liveRegionAround(message: string) {
  let node = screen.getByText(message).parent;
  while (node && !node.props.accessibilityLiveRegion) node = node.parent;
  return node;
}

beforeEach(() => {
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('Toast', () => {
  it('shows a success message and announces it for TalkBack', async () => {
    await renderWithQuery(<Caller />);
    await fireEvent.press(screen.getByText('Save'));

    expect(screen.getByText('Product saved')).toBeTruthy();
    // The container is a polite live region, not one focusable node, so the dismiss button stays reachable by itself.
    const toast = liveRegionAround('Product saved');
    expect(toast?.props.accessibilityLiveRegion).toBe('polite');
    expect(toast?.props.accessibilityRole).toBe('summary');
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith('Product saved');
  });

  it('announces a failure as an alert', async () => {
    await renderWithQuery(<Caller />);
    await fireEvent.press(screen.getByText('Fail'));

    expect(liveRegionAround('Product not saved. Check your connection.')?.props.accessibilityRole).toBe('alert');
  });

  it('shows one toast at a time: a new one replaces the current', async () => {
    await renderWithQuery(<Caller />);
    await fireEvent.press(screen.getByText('Save'));
    await fireEvent.press(screen.getByText('Sync'));

    expect(screen.getByText('Stock synced from the marketplace')).toBeTruthy();
    expect(screen.queryByText('Product saved')).toBeNull();
  });

  it('closes from its dismiss button, a full-size touch target with a label', async () => {
    await renderWithQuery(<Caller />);
    await fireEvent.press(screen.getByText('Save'));
    await fireEvent.press(screen.getByRole('button', { name: 'Dismiss message' }));

    expect(screen.queryByText('Product saved')).toBeNull();
  });

  it('leaves on its own after a few seconds', async () => {
    jest.useFakeTimers();
    await renderWithQuery(<Caller />);
    await fireEvent.press(screen.getByText('Save'));
    expect(screen.getByText('Product saved')).toBeTruthy();

    await act(() => jest.advanceTimersByTime(3900));
    expect(screen.getByText('Product saved')).toBeTruthy();
    await act(() => jest.advanceTimersByTime(200));
    expect(screen.queryByText('Product saved')).toBeNull();
  });

  it('fails loudly when a screen calls it outside the provider', async () => {
    // React reports the thrown error to the console as well; that output is expected here.
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(render(<Caller />)).rejects.toThrow('useToast must be called inside <ToastProvider>');
  });
});
