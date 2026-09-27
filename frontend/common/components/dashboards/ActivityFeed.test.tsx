import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ActivityFeed } from './ActivityFeed';

describe('ActivityFeed', () => {
  it('always renders the title', async () => {
    await render(<ActivityFeed title="Recent Sales" items={[]} emptyMessage="No sales yet" />);
    expect(screen.getByText('Recent Sales')).toBeTruthy();
  });

  it('shows the empty message when there are no items', async () => {
    await render(<ActivityFeed title="Recent Sales" items={[]} emptyMessage="No sales yet" />);
    expect(screen.getByText('No sales yet')).toBeTruthy();
  });

  it('renders each item with its subtitle and optional trailing value', async () => {
    await render(
      <ActivityFeed
        title="Recent Sales"
        emptyMessage="No sales yet"
        items={[
          { id: '1', title: 'Buyer A', subtitle: 'Rs. 100 · completed', value: 'Rs. 100' },
          { id: '2', title: 'Buyer B', subtitle: 'Rs. 50 · pending' },
        ]}
      />,
    );
    expect(screen.getByText('Buyer A')).toBeTruthy();
    expect(screen.getByText('Rs. 100 · completed')).toBeTruthy();
    expect(screen.getByText('Rs. 100')).toBeTruthy();
    expect(screen.getByText('Buyer B')).toBeTruthy();
    expect(screen.queryByText('No sales yet')).toBeNull();
  });

  it('calls onPress for an item that has one', async () => {
    const onPress = jest.fn();
    await render(
      <ActivityFeed
        title="Recent Sales"
        emptyMessage="No sales yet"
        items={[{ id: '1', title: 'Buyer A', subtitle: 'Rs. 100', onPress }]}
      />,
    );
    fireEvent.press(screen.getByText('Buyer A'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('disables the row for an item with no onPress', async () => {
    await render(
      <ActivityFeed
        title="Recent Sales"
        emptyMessage="No sales yet"
        items={[{ id: '1', title: 'Buyer A', subtitle: 'Rs. 100' }]}
      />,
    );
    expect(screen.getByTestId('activity-row-1').props.accessibilityState?.disabled).toBe(true);
  });
});
