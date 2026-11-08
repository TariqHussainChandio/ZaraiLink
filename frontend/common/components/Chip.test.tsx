import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { rippleOf } from '../../testUtils/ripple';
import { lightTheme } from '../../theme';
import { Chip, ChipRow, type ChipOption } from './Chip';

describe('Chip', () => {
  it('renders the label and calls onPress when tapped', async () => {
    const onPress = jest.fn();
    await render(<Chip label="Seed" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Seed' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('reports its selected state, and defaults to not selected', async () => {
    await render(<Chip label="Seed" selected onPress={() => {}} />);
    expect(screen.getByRole('button', { name: 'Seed' })).toBeSelected();
    await render(<Chip label="Grain" onPress={() => {}} />);
    expect(screen.getByRole('button', { name: 'Grain' })).not.toBeSelected();
  });

  it('ripples, and a chosen chip takes a 2 px accent border without changing its width', async () => {
    await render(<Chip label="Seed" selected onPress={() => {}} />);
    expect(screen.getByRole('button', { name: 'Seed' }).props.nativeBackgroundAndroid).toEqual(rippleOf(lightTheme.colors.ripple));
    const chosen = StyleSheet.flatten(screen.getByRole('button', { name: 'Seed' }).props.style);
    expect(chosen.borderWidth).toBe(lightTheme.borders.selected);
    expect(chosen.borderColor).toBe(lightTheme.colors.accent.brand.mark);
    await render(<Chip label="Grain" onPress={() => {}} />);
    const plain = StyleSheet.flatten(screen.getByRole('button', { name: 'Grain' }).props.style);
    // Border plus padding is the same in both states, so choosing a chip never moves its neighbours.
    expect((chosen.borderWidth ?? 0) * 2 + (chosen.paddingHorizontal ?? 0) * 2).toBe((plain.borderWidth ?? 0) * 2 + (plain.paddingHorizontal ?? 0) * 2);
  });

  it('is 40 dp tall with a hit area that reaches 48', async () => {
    await render(<Chip label="Seed" onPress={() => {}} />);
    const chip = screen.getByRole('button', { name: 'Seed' });
    expect(StyleSheet.flatten(chip.props.style).minHeight).toBe(lightTheme.size.chip);
    expect(chip.props.hitSlop).toBe(lightTheme.components.hitSlop(lightTheme.size.chip));
  });

  it('shows its count and ignores taps when disabled', async () => {
    const onPress = jest.fn();
    await render(<Chip label="Fertiliser" count={73} disabled onPress={onPress} />);
    expect(screen.getByText('73')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: /Fertiliser/ }));
    expect(onPress).not.toHaveBeenCalled();
  });
});

type Filter = 'all' | 'open' | 'resolved';
const options: ChipOption<Filter>[] = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'resolved', label: 'Resolved' },
];

describe('ChipRow', () => {
  it('renders every option and marks only the current value selected', async () => {
    await render(<ChipRow options={options} value="open" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Open' })).toBeSelected();
    expect(screen.getByRole('button', { name: 'All' })).not.toBeSelected();
    expect(screen.getByRole('button', { name: 'Resolved' })).not.toBeSelected();
  });

  it('shows the count of an option after its label', async () => {
    await render(<ChipRow options={[{ value: 'all', label: 'All', count: 12 }, { value: 'open', label: 'Open' }]} value="all" onChange={() => {}} />);
    expect(screen.getByText('12')).toBeTruthy();
  });

  it('reports the chosen value', async () => {
    const onChange = jest.fn();
    await render(<ChipRow options={options} value="all" onChange={onChange} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Resolved' }));
    expect(onChange).toHaveBeenCalledWith('resolved');
  });

  it('wraps onto a second line when every option must stay visible, instead of scrolling sideways', async () => {
    await render(<ChipRow options={options} value="all" onChange={() => {}} wrap />);
    expect(screen.getByRole('button', { name: 'Resolved' })).toBeTruthy();
    // A horizontally scrolling row renders as a scroll view at its root; a wrapping one is a plain view.
    expect(screen.toJSON()).toMatchObject({ type: 'View' });
  });
});
