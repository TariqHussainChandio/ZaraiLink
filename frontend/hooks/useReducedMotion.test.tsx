import React from 'react';
import { AccessibilityInfo, Text } from 'react-native';
import { act, render, screen } from '@testing-library/react-native';
import { useReducedMotion } from './useReducedMotion';

function Probe() {
  return <Text>{useReducedMotion() ? 'reduced' : 'full'}</Text>;
}

describe('useReducedMotion', () => {
  afterEach(() => jest.restoreAllMocks());

  it('is off until the phone says otherwise', async () => {
    await render(<Probe />);
    expect(screen.getByText('full')).toBeTruthy();
  });

  it('turns on when the phone already asks for reduced motion', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    await render(<Probe />);
    expect(await screen.findByText('reduced')).toBeTruthy();
  });

  it('follows the setting while the app is open', async () => {
    let notify: (enabled: boolean) => void = () => undefined;
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((_event: string, handler: (enabled: boolean) => void) => {
      notify = handler;
      return { remove: () => undefined };
    }) as never);
    await render(<Probe />);
    await act(async () => notify(true));
    expect(screen.getByText('reduced')).toBeTruthy();
  });
});
