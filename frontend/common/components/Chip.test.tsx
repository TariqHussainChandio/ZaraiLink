import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
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

  it('reports the chosen value', async () => {
    const onChange = jest.fn();
    await render(<ChipRow options={options} value="all" onChange={onChange} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Resolved' }));
    expect(onChange).toHaveBeenCalledWith('resolved');
  });
});
