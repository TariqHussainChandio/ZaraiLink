import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { lightColors } from '../../../theme';
import { StatTile } from './StatTile';

function backgroundOf(node: ReturnType<typeof screen.getByTestId>): string | undefined {
  const styles = ([] as { backgroundColor?: string }[]).concat(node.props.style).flat(Infinity) as { backgroundColor?: string }[];
  return styles.reduce<string | undefined>((found, s) => s?.backgroundColor ?? found, undefined);
}

describe('StatTile', () => {
  it('renders the value, grouped the en-PK way, and the label', async () => {
    await render(<StatTile label="Stock units" value={3482} unit="units" />);
    expect(screen.getByText('3,482')).toBeTruthy();
    expect(screen.getByText('Stock units')).toBeTruthy();
    expect(screen.getByText('units')).toBeTruthy();
  });

  it('renders a string value as-is', async () => {
    await render(<StatTile label="Sales" value="Rs 5,000" />);
    expect(screen.getByText('Rs 5,000')).toBeTruthy();
  });

  it('marks the tile with the given module colour', async () => {
    await render(<StatTile label="Orders" value={3} accent={lightColors.module.orders} />);
    expect(backgroundOf(screen.getByTestId('stat-tile-accent'))).toBe(lightColors.module.orders);
  });

  it("falls back to the shell's accent, the board green outside any shell", async () => {
    await render(<StatTile label="Orders" value={3} />);
    expect(backgroundOf(screen.getByTestId('stat-tile-accent'))).toBe(lightColors.accent.brand.mark);
  });

  it('shows a dash, never 0, for a figure that could not be loaded, and says it is not available', async () => {
    await render(<StatTile label="Orders to dispatch" value={null} unit="orders" />);
    expect(screen.getByText('—')).toBeTruthy();
    expect(screen.queryByText('0')).toBeNull();
    // The unit means nothing without a number.
    expect(screen.queryByText('orders')).toBeNull();
    expect(screen.getByLabelText('Orders to dispatch: not available')).toBeTruthy();
    await render(<StatTile label="Revenue" value={undefined} />);
    expect(screen.getByLabelText('Revenue: not available')).toBeTruthy();
  });

  it('still shows a real zero as 0', async () => {
    await render(<StatTile label="Orders to dispatch" value={0} />);
    expect(screen.getByText('0')).toBeTruthy();
  });

  it('is one button that opens where the number comes from, when given onPress', async () => {
    const onPress = jest.fn();
    await render(<StatTile label="Orders to dispatch" value={3} onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Orders to dispatch: 3' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('is not a button without onPress', async () => {
    await render(<StatTile label="Orders to dispatch" value={3} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('takes its mark and figure from a tone', async () => {
    await render(<StatTile label="Late orders" value={2} tone="warning" />);
    expect(backgroundOf(screen.getByTestId('stat-tile-accent'))).toBe(lightColors.status.warning.mark);
    expect(StyleSheet.flatten(screen.getByText('2').props.style).color).toBe(lightColors.status.warning.ink);
  });
});
