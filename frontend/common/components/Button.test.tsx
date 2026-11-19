import React from 'react';
import { StyleSheet } from 'react-native';
import { Ban } from 'lucide-react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { rippleOf } from '../../testUtils/ripple';
import { lightTheme } from '../../theme';
import { Button } from './Button';

describe('Button', () => {
  it('renders its label', async () => {
    await render(<Button label="Sign In" onPress={() => {}} />);
    expect(screen.getByText('Sign In')).toBeTruthy();
  });

  it('calls onPress when tapped', async () => {
    const onPress = jest.fn();
    await render(<Button label="Sign In" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not call onPress when disabled', async () => {
    const onPress = jest.fn();
    await render(<Button label="Sign In" onPress={onPress} disabled />);
    await fireEvent.press(screen.getByRole('button'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('keeps its label while loading, so a sticky bar does not jump, and blocks the press', async () => {
    const onPress = jest.fn();
    await render(<Button label="Place order" onPress={onPress} loading />);
    expect(screen.getByText('Place order')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('says it is busy and disabled while loading', async () => {
    await render(<Button label="Sign In" onPress={() => {}} loading />);
    expect(screen.getByRole('button').props.accessibilityState).toMatchObject({ disabled: true, busy: true });
  });

  it('ripples on press and never scales: the ripple is light on a fill and dark on paper', async () => {
    await render(<Button label="Place order" />);
    expect(screen.getByRole('button').props.nativeBackgroundAndroid).toEqual(rippleOf(lightTheme.colors.rippleOnFill));
    await render(<Button label="Save" variant="secondary" />);
    expect(screen.getByRole('button', { name: 'Save' }).props.nativeBackgroundAndroid).toEqual(rippleOf(lightTheme.colors.ripple));
    expect(StyleSheet.flatten(screen.getByRole('button', { name: 'Save' }).props.style).transform).toBeUndefined();
  });

  it('has a quiet danger variant whose text is the danger ink', async () => {
    await render(<Button label="Cancel this order" variant="dangerQuiet" icon={Ban} />);
    const text = screen.getByText('Cancel this order');
    expect(StyleSheet.flatten(text.props.style).color).toBe(lightTheme.colors.status.danger.ink);
    expect(StyleSheet.flatten(screen.getByRole('button').props.style).backgroundColor).toBe('transparent');
  });

  it('is a full touch target at md and lg', async () => {
    await render(<Button label="Place order" size="lg" />);
    expect(StyleSheet.flatten(screen.getByRole('button').props.style).minHeight).toBe(lightTheme.size.buttonLg);
  });
});
