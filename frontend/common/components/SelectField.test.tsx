import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { lightTheme } from '../../theme';
import { TextField } from './TextField';
import { SelectField, type SelectOption } from './SelectField';

const options: SelectOption[] = [
  { id: 'kg', label: 'Kilogram' },
  { id: 'bag', label: 'Bag' },
  { id: 'crate', label: 'Crate' },
];

describe('SelectField — closed state', () => {
  it('shows the default placeholder when nothing is selected', async () => {
    await render(<SelectField value={null} options={options} onSelect={() => {}} />);
    expect(screen.getByText('Select...')).toBeTruthy();
  });

  it('shows a custom placeholder', async () => {
    await render(<SelectField value={null} options={options} onSelect={() => {}} placeholder="Pick a unit" />);
    expect(screen.getByText('Pick a unit')).toBeTruthy();
  });

  it("shows the selected option's label instead of the placeholder", async () => {
    await render(<SelectField value="bag" options={options} onSelect={() => {}} />);
    expect(screen.getByText('Bag')).toBeTruthy();
    expect(screen.queryByText('Select...')).toBeNull();
  });

  it('renders the label when given', async () => {
    await render(<SelectField label="Unit" value={null} options={options} onSelect={() => {}} />);
    expect(screen.getByText('Unit')).toBeTruthy();
  });

  it('renders an error message when given', async () => {
    await render(<SelectField value={null} options={options} onSelect={() => {}} error="Pick one" />);
    expect(screen.getByText('Pick one')).toBeTruthy();
  });

  it('shows "Loading…" while loading', async () => {
    await render(<SelectField value={null} options={options} onSelect={() => {}} loading />);
    expect(screen.getByText('Loading…')).toBeTruthy();
  });
});

describe('SelectField — look', () => {
  it('has the same label as a text field, so a select and a text field in one form read alike', async () => {
    await render(
      <>
        <SelectField label="Unit" value={null} options={options} onSelect={() => {}} />
        <TextField label="Price" />
      </>,
    );
    expect(StyleSheet.flatten(screen.getByText('Unit').props.style)).toEqual(StyleSheet.flatten(screen.getByText('Price').props.style));
    expect(StyleSheet.flatten(screen.getByText('Unit').props.style).color).toBe(lightTheme.colors.ink);
  });

  it('says the error in words under the field', async () => {
    await render(<SelectField label="Unit" value={null} options={options} onSelect={() => {}} error="Choose a unit" />);
    expect(screen.getByText('Choose a unit')).toBeTruthy();
  });
});

describe('SelectField — for TalkBack', () => {
  it('reads the closed field as a button with its label and the chosen option', async () => {
    await render(<SelectField label="Unit" value="bag" options={options} onSelect={() => {}} />);
    expect(screen.getByRole('button', { name: 'Unit, Bag' })).toBeTruthy();
  });

  it('marks the chosen option as selected in the open picker', async () => {
    await render(<SelectField label="Unit" value="bag" options={options} onSelect={() => {}} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Unit, Bag' }));
    const chosen = await screen.findByRole('button', { name: 'Bag', selected: true, includeHiddenElements: true });
    expect(chosen).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Kilogram', selected: false, includeHiddenElements: true })).toBeTruthy();
  });
});

describe('SelectField — opening the picker', () => {
  it('opens the option sheet when the field is pressed', async () => {
    await render(<SelectField value={null} options={options} onSelect={() => {}} />);
    await fireEvent.press(screen.getByText('Select...'));
    expect(screen.getByText('Kilogram')).toBeTruthy();
    expect(screen.getByText('Crate')).toBeTruthy();
  });

  it('does not open when disabled', async () => {
    await render(<SelectField value={null} options={options} onSelect={() => {}} disabled />);
    await fireEvent.press(screen.getByText('Select...'));
    expect(screen.queryByText('Kilogram')).toBeNull();
  });

  it('does not open while loading', async () => {
    await render(<SelectField value={null} options={options} onSelect={() => {}} loading />);
    await fireEvent.press(screen.getByText('Loading…'));
    expect(screen.queryByText('Kilogram')).toBeNull();
  });
});

describe('SelectField — selecting an option', () => {
  it('calls onSelect with the tapped option id and closes the sheet', async () => {
    const onSelect = jest.fn();
    await render(<SelectField value={null} options={options} onSelect={onSelect} />);
    await fireEvent.press(screen.getByText('Select...'));
    await fireEvent.press(screen.getByText('Bag'));
    expect(onSelect).toHaveBeenCalledWith('bag');
    expect(screen.queryByText('Kilogram')).toBeNull();
  });
});

describe('SelectField — search', () => {
  it('renders a search field by default and filters options by it', async () => {
    await render(<SelectField value={null} options={options} onSelect={() => {}} />);
    await fireEvent.press(screen.getByText('Select...'));
    await fireEvent.changeText(screen.getByPlaceholderText('Search'), 'bag');
    expect(screen.getByText('Bag')).toBeTruthy();
    expect(screen.queryByText('Kilogram')).toBeNull();
    expect(screen.queryByText('Crate')).toBeNull();
  });

  it('filtering is case-insensitive', async () => {
    await render(<SelectField value={null} options={options} onSelect={() => {}} />);
    await fireEvent.press(screen.getByText('Select...'));
    await fireEvent.changeText(screen.getByPlaceholderText('Search'), 'KILO');
    expect(screen.getByText('Kilogram')).toBeTruthy();
  });

  it('shows an empty state when no options match', async () => {
    await render(<SelectField value={null} options={options} onSelect={() => {}} />);
    await fireEvent.press(screen.getByText('Select...'));
    await fireEvent.changeText(screen.getByPlaceholderText('Search'), 'nonexistent');
    expect(screen.getByText('No results')).toBeTruthy();
  });

  it('omits the search field when searchable is false', async () => {
    await render(<SelectField value={null} options={options} onSelect={() => {}} searchable={false} />);
    await fireEvent.press(screen.getByText('Select...'));
    expect(screen.queryByPlaceholderText('Search')).toBeNull();
    expect(screen.getByText('Kilogram')).toBeTruthy();
  });
});
