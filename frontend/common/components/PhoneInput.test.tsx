import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { PhoneInput, isValidE164 } from './PhoneInput';

describe('PhoneInput', () => {
  it('defaults its label to "Phone"', async () => {
    await render(<PhoneInput value={null} onChange={() => {}} />);
    expect(screen.getByText('Phone')).toBeTruthy();
  });

  it('accepts a custom label', async () => {
    await render(<PhoneInput label="Contact" value={null} onChange={() => {}} />);
    expect(screen.getByText('Contact')).toBeTruthy();
  });

  it('renders the current value', async () => {
    await render(<PhoneInput value="+923001234567" onChange={() => {}} />);
    expect(screen.getByDisplayValue('+923001234567')).toBeTruthy();
  });

  it('renders an error message when given', async () => {
    await render(<PhoneInput value={null} onChange={() => {}} error="Enter a valid phone number" />);
    expect(screen.getByText('Enter a valid phone number')).toBeTruthy();
  });

  it('converts an emptied field to null', async () => {
    const onChange = jest.fn();
    await render(<PhoneInput value="+923001234567" onChange={onChange} />);
    fireEvent.changeText(screen.getByDisplayValue('+923001234567'), '');
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('passes through a non-empty edit', async () => {
    const onChange = jest.fn();
    await render(<PhoneInput value={null} onChange={onChange} />);
    fireEvent.changeText(screen.getByPlaceholderText('+923001234567'), '+923001112223');
    expect(onChange).toHaveBeenCalledWith('+923001112223');
  });
});

describe('isValidE164', () => {
  it.each([
    ['+923001234567', true],
    ['+14155552671', true],
    ['923001234567', false], // missing +
    ['+0123456789', false], // leading 0 after +
    ['+92300', false], // too short
    ['not a number', false],
    ['', false],
  ])('isValidE164(%s) === %s', (value, expected) => {
    expect(isValidE164(value)).toBe(expected);
  });
});
