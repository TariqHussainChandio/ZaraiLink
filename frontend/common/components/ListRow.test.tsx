import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { rippleOf } from '../../testUtils/ripple';
import { lightTheme } from '../../theme';
import { StatusBadge } from './StatusBadge';
import { ListGroup, ListRow } from './ListRow';

describe('ListRow', () => {
  it('reads a tappable row as one button that says everything in it, not only the title and meta', async () => {
    const onPress = jest.fn();
    await render(
      <ListRow
        title="Sona Urea, 50 kg bag × 20"
        meta="Nadia Batool, Okara"
        trailing={<Text>Rs 95,800</Text>}
        status={<StatusBadge kind="order" status="confirmed" />}
        onPress={onPress}
      />,
    );
    const row = screen.getByRole('button');
    // No label of its own: TalkBack reads every text inside, so the price and the status are heard.
    expect(row.props.accessibilityLabel).toBeUndefined();
    for (const part of ['Sona Urea, 50 kg bag × 20', 'Nadia Batool, Okara', 'Rs 95,800', 'Confirmed']) {
      expect(screen.getByRole('button', { name: new RegExp(part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) })).toBeTruthy();
    }
    await fireEvent.press(row);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('reads a row with only a title and meta as "title, meta"', async () => {
    await render(<ListRow title="Urea, 50 kg bag" meta="Order ZL-24817 · 3 bags" onPress={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Urea, 50 kg bag, Order ZL-24817 · 3 bags' })).toBeTruthy();
    await render(<ListRow title="Users" onPress={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Users' })).toBeTruthy();
  });

  it('lets a screen replace what is read out', async () => {
    await render(<ListRow title="Urea" trailing={<Text>Rs 95,800</Text>} onPress={() => undefined} accessibilityLabel="Urea, 20 bags, Rs 95,800" />);
    expect(screen.getByRole('button', { name: 'Urea, 20 bags, Rs 95,800' })).toBeTruthy();
  });

  it('puts the status in the text column under the meta, never beside a long title', async () => {
    await render(<ListRow title="A long title that must wrap" meta="Okara" status={<StatusBadge kind="order" status="ready" />} />);
    const column = screen.getByText('A long title that must wrap').parent;
    if (!column) throw new Error('the title has no column');
    expect(within(column).getByText('Okara')).toBeTruthy();
    expect(within(column).getByText('Ready for dispatch')).toBeTruthy();
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

  it('ripples when pressed instead of filling the row', async () => {
    await render(<ListRow title="Urea, 50 kg bag" onPress={() => undefined} />);
    expect(screen.getByRole('button').props.nativeBackgroundAndroid).toEqual(rippleOf(lightTheme.colors.ripple));
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
