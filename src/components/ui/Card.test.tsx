import React from 'react';
import { Text } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
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
    fireEvent.press(screen.getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
