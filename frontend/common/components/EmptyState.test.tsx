import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { lightTheme } from '../../theme';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  it('renders the title', async () => {
    await render(<EmptyState title="No listings yet" />);
    expect(screen.getByText('No listings yet')).toBeTruthy();
  });

  it('renders the description only when given', async () => {
    await render(<EmptyState title="No listings yet" description="Add your first listing." />);
    expect(screen.getByText('Add your first listing.')).toBeTruthy();
  });

  it('omits the description when not given', async () => {
    await render(<EmptyState title="No listings yet" />);
    expect(screen.queryByText(/Add your first/)).toBeNull();
  });

  it('renders no action button when actionLabel/onAction are omitted', async () => {
    await render(<EmptyState title="No listings yet" />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders and wires up the retry/action button when both are given', async () => {
    const onAction = jest.fn();
    await render(<EmptyState title="Couldn't load" actionLabel="Retry" onAction={onAction} />);
    fireEvent.press(screen.getByRole('button'));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('does not render the action button when only one of actionLabel/onAction is given', async () => {
    await render(<EmptyState title="Couldn't load" actionLabel="Retry" />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('puts its icon on a square tile with the md corner, not a disc', async () => {
    await render(<EmptyState title="No listings yet" />);
    const tile = screen.getByRole('header', { name: 'No listings yet' }).parent?.children[0];
    const style = StyleSheet.flatten(typeof tile === 'string' || !tile ? undefined : tile.props.style);
    expect(style.borderRadius).toBe(lightTheme.radius.md);
    expect(style.width).toBe(style.height);
  });
});
