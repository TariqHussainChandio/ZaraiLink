import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { darkTheme, lightTheme } from '../../theme';
import { RatePlate } from './RatePlate';

describe('RatePlate', () => {
  it('is one stop that reads the price and its unit together', async () => {
    await render(<RatePlate amount={4250} unit="per 40 kg" />);
    expect(screen.getByLabelText('Rs 4,250, per 40 kg')).toBeTruthy();
  });

  it('shows the figure grouped the en-PK way, with Rs, and the unit under it', async () => {
    await render(<RatePlate amount={124500} unit="per 50 kg bag" size="xl" />);
    expect(screen.getByText(/124,500/)).toBeTruthy();
    expect(screen.getByText('Rs')).toBeTruthy();
    expect(screen.getByText('per 50 kg bag')).toBeTruthy();
  });

  it('is chalk on the board: onBoard figure and boardInk2 unit on a board ground', async () => {
    await render(<RatePlate amount={4250} unit="per 40 kg" />);
    const plate = screen.getByLabelText('Rs 4,250, per 40 kg');
    expect(StyleSheet.flatten(plate.props.style).backgroundColor).toBe(lightTheme.colors.board);
    expect(StyleSheet.flatten(screen.getByText(/4,250/).props.style).color).toBe(lightTheme.colors.onBoard);
    expect(StyleSheet.flatten(screen.getByText('per 40 kg').props.style).color).toBe(lightTheme.colors.boardInk2);
  });

  it('lifts the board in the dark theme so the plate still stands off the paper', () => {
    expect(darkTheme.colors.board).not.toBe(lightTheme.colors.board);
  });

  it.each([
    ['xl', lightTheme.typography.figureXl.fontSize],
    ['lg', lightTheme.typography.figureLg.fontSize],
    ['md', lightTheme.typography.price.fontSize],
  ] as const)('sets the %s figure at the type scale\'s size, in the board face with tabular numerals', async (size, fontSize) => {
    await render(<RatePlate amount={4250} unit="per 40 kg" size={size} />);
    const figure = StyleSheet.flatten(screen.getByText(/4,250/).props.style);
    expect(figure.fontSize).toBe(fontSize);
    expect(figure.fontFamily).toBe(lightTheme.typography.price.fontFamily);
    expect(figure.fontVariant).toEqual(['tabular-nums']);
  });

  it('draws Rs smaller than the figure so the number is what reads from arm\'s length', async () => {
    await render(<RatePlate amount={4250} unit="per 40 kg" size="xl" />);
    const currency = StyleSheet.flatten(screen.getByText('Rs').props.style);
    expect(currency.fontSize).toBeLessThan(lightTheme.typography.figureXl.fontSize);
  });

  it('shrinks the figure to fit its plate at a large font scale, and never becomes a control', async () => {
    await render(<RatePlate amount={4250} unit="per 40 kg" />);
    expect(screen.getByText(/4,250/).props.adjustsFontSizeToFit).toBe(true);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
