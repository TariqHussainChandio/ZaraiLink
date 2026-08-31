import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { StatCard } from './StatCard';

describe('StatCard', () => {
  it('renders the value and label', async () => {
    await render(<StatCard label="Active Listings" value={12} />);
    expect(screen.getByText('12')).toBeTruthy();
    expect(screen.getByText('Active Listings')).toBeTruthy();
  });

  it('renders a string value as-is', async () => {
    await render(<StatCard label="Sales" value="Rs. 5,000" />);
    expect(screen.getByText('Rs. 5,000')).toBeTruthy();
  });

  it('uses the given accent color for the accent bar', async () => {
    await render(<StatCard label="Orders" value={3} accent="#1976D2" />);
    const accentStyle = screen.getByTestId('stat-card-accent').props.style;
    expect(accentStyle.find((s: { backgroundColor?: string }) => s?.backgroundColor)?.backgroundColor).toBe(
      '#1976D2',
    );
  });

  it('falls back to the brand primary color when no accent is given', async () => {
    await render(<StatCard label="Orders" value={3} />);
    const accentStyle = screen.getByTestId('stat-card-accent').props.style;
    // brand.primary in the default (light) theme.
    expect(accentStyle.find((s: { backgroundColor?: string }) => s?.backgroundColor)?.backgroundColor).toBe(
      '#2E7D32',
    );
  });
});
