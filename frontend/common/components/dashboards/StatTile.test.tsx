import React from 'react';
import { render, screen } from '@testing-library/react-native';
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

  it("falls back to the shell's accent, the brand green outside any shell", async () => {
    await render(<StatTile label="Orders" value={3} />);
    expect(backgroundOf(screen.getByTestId('stat-tile-accent'))).toBe(lightColors.accent.brand.mark);
  });
});
