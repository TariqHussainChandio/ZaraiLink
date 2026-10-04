import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { lightTheme } from '../../theme';
import { ListGroup, ListRow } from './ListRow';

describe('ListRow', () => {
  it('reads a tappable row as one button: title, then metadata', async () => {
    const onPress = jest.fn();
    await render(<ListRow title="Urea, 50 kg bag" meta="Order ZL-24817 · 3 bags" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Urea, 50 kg bag, Order ZL-24817 · 3 bags' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('is not a button when it opens nothing', async () => {
    await render(<ListRow title="Nadia Batool" meta="Basmati rice, 12 maunds" />);
    expect(screen.getByText('Nadia Batool')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('is at least a full row tall, so it is an easy target', async () => {
    await render(<ListRow title="Urea, 50 kg bag" onPress={() => undefined} />);
    const style = StyleSheet.flatten(screen.getByRole('button').props.style);
    expect(style.minHeight).toBeGreaterThanOrEqual(lightTheme.size.touchMin);
    expect(style.minHeight).toBe(lightTheme.size.row);
  });

  it('shows its trailing facts', async () => {
    await render(<ListRow title="Urea, 50 kg bag" trailing={<Text>Rs 4,750</Text>} />);
    expect(screen.getByText('Rs 4,750')).toBeTruthy();
  });
});

describe('ListGroup', () => {
  it('shows every row and skips the empty slots a condition leaves', async () => {
    const hidden = false;
    await render(
      <ListGroup>
        <ListRow title="First" />
        {hidden ? <ListRow title="Hidden" /> : null}
        <ListRow title="Second" />
      </ListGroup>,
    );
    expect(screen.getByText('First')).toBeTruthy();
    expect(screen.getByText('Second')).toBeTruthy();
    expect(screen.queryByText('Hidden')).toBeNull();
  });
});
