import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Button } from './Button';

describe('Button', () => {
  it('renders its label', async () => {
    await render(<Button label="Sign In" onPress={() => {}} />);
    expect(screen.getByText('Sign In')).toBeTruthy();
  });

  it('calls onPress when tapped', async () => {
    const onPress = jest.fn();
    await render(<Button label="Sign In" onPress={onPress} />);
    fireEvent.press(screen.getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not call onPress when disabled', async () => {
    const onPress = jest.fn();
    await render(<Button label="Sign In" onPress={onPress} disabled />);
    fireEvent.press(screen.getByRole('button'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('shows a spinner instead of the label while loading, and blocks the press', async () => {
    const onPress = jest.fn();
    await render(<Button label="Sign In" onPress={onPress} loading />);
    expect(screen.queryByText('Sign In')).toBeNull();
    fireEvent.press(screen.getByRole('button'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('marks the accessibility state as disabled while loading', async () => {
    await render(<Button label="Sign In" onPress={() => {}} loading />);
    expect(screen.getByRole('button').props.accessibilityState).toMatchObject({ disabled: true });
  });
});
