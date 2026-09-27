import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { FilterChips, type FilterChipOption } from './FilterChips';

type FilterValue = 'all' | 'open' | 'resolved';

const options: FilterChipOption<FilterValue>[] = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'resolved', label: 'Resolved' },
];

describe('FilterChips', () => {
  it('renders every option label', async () => {
    await render(<FilterChips options={options} value="all" onChange={() => {}} />);
    expect(screen.getByText('All')).toBeTruthy();
    expect(screen.getByText('Open')).toBeTruthy();
    expect(screen.getByText('Resolved')).toBeTruthy();
  });

  it('marks the active option as selected via accessibilityState', async () => {
    await render(<FilterChips options={options} value="open" onChange={() => {}} />);
    expect(screen.getByText('Open').parent?.props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByText('All').parent?.props.accessibilityState).toMatchObject({ selected: false });
  });

  it('calls onChange with the tapped option value', async () => {
    const onChange = jest.fn();
    await render(<FilterChips options={options} value="all" onChange={onChange} />);
    fireEvent.press(screen.getByText('Resolved'));
    expect(onChange).toHaveBeenCalledWith('resolved');
  });
});
