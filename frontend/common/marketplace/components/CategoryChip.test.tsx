import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { CategoryChip } from './CategoryChip';

describe('CategoryChip', () => {
  it('renders the label', async () => {
    await render(<CategoryChip label="Seeds" onPress={() => {}} />);
    expect(screen.getByText('Seeds')).toBeTruthy();
  });

  it('calls onPress when tapped', async () => {
    const onPress = jest.fn();
    await render(<CategoryChip label="Seeds" onPress={onPress} />);
    fireEvent.press(screen.getByText('Seeds'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('reflects selected state via accessibilityState', async () => {
    await render(<CategoryChip label="Seeds" selected onPress={() => {}} />);
    expect(screen.getByRole('button').props.accessibilityState.selected).toBe(true);
  });

  it('defaults to not selected', async () => {
    await render(<CategoryChip label="Seeds" onPress={() => {}} />);
    expect(screen.getByRole('button').props.accessibilityState.selected).toBe(false);
  });
});
