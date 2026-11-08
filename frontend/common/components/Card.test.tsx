import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { rippleOf } from '../../testUtils/ripple';
import { lightTheme } from '../../theme';
import { Card } from './Card';

describe('Card', () => {
  it('renders its children', async () => {
    await render(
      <Card>
        <Text>Card content</Text>
      </Card>,
    );
    expect(screen.getByText('Card content')).toBeTruthy();
  });

  it('is not pressable when no onPress is given', async () => {
    await render(
      <Card>
        <Text>Static</Text>
      </Card>,
    );
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('becomes pressable and calls onPress when one is given', async () => {
    const onPress = jest.fn();
    await render(
      <Card onPress={onPress}>
        <Text>Tappable</Text>
      </Card>,
    );
    await fireEvent.press(screen.getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('puts its label and testID on the pressable itself, which is what TalkBack and tests find', async () => {
    const onPress = jest.fn();
    await render(
      <Card onPress={onPress} testID="listing-card" accessibilityLabel="Sona Urea, Rs 4,250, Okara">
        <Text>Sona Urea</Text>
      </Card>,
    );
    const card = screen.getByRole('button', { name: 'Sona Urea, Rs 4,250, Okara' });
    expect(card).toBe(screen.getByTestId('listing-card'));
    await fireEvent.press(screen.getByTestId('listing-card'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('ripples when pressed and never scales', async () => {
    await render(
      <Card onPress={() => undefined}>
        <Text>Tappable</Text>
      </Card>,
    );
    const card = screen.getByRole('button');
    expect(card.props.nativeBackgroundAndroid).toEqual(rippleOf(lightTheme.colors.ripple));
    expect(StyleSheet.flatten(card.props.style).transform).toBeUndefined();
  });

  it('draws a chosen card with the thicker accent border', async () => {
    await render(
      <Card selected>
        <Text>Chosen</Text>
      </Card>,
    );
    const style = StyleSheet.flatten(screen.getByText('Chosen').parent?.props.style);
    expect(style.borderWidth).toBe(lightTheme.borders.selected);
  });
});
