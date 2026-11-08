import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { PhoneInput, isValidE164 } from './PhoneInput';

/** A form field that holds the value the way a screen's form does. */
function Harness({ initial = null, onValue }: { initial?: string | null; onValue?: (value: string | null) => void }) {
  const [value, setValue] = useState<string | null>(initial);
  return (
    <PhoneInput
      value={value}
      onChange={next => {
        setValue(next);
        onValue?.(next);
      }}
    />
  );
}

describe('PhoneInput', () => {
  it('defaults its label to "Phone"', async () => {
    await render(<PhoneInput value={null} onChange={() => {}} />);
    expect(screen.getByText('Phone')).toBeTruthy();
  });

  it('accepts a custom label', async () => {
    await render(<PhoneInput label="Contact" value={null} onChange={() => {}} />);
    expect(screen.getByText('Contact')).toBeTruthy();
  });

  it('shows an example in the Pakistani way', async () => {
    await render(<PhoneInput value={null} onChange={() => {}} />);
    expect(screen.getByText('For example 0300 1234567')).toBeTruthy();
    expect(screen.getByPlaceholderText('0300 1234567')).toBeTruthy();
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
    await fireEvent.changeText(screen.getByDisplayValue('+923001234567'), '');
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it.each([
    ['0300 1234567', 'the way it is said on a Pakistani phone'],
    ['+92 300 1234567', 'with the country code and spaces'],
    ['923001234567', 'with the country code and no plus'],
    ['0300-1234567', 'with a dash'],
  ])('reads %s (%s) as one E.164 number', async (typed) => {
    const onValue = jest.fn();
    await render(<Harness onValue={onValue} />);
    await fireEvent.changeText(screen.getByLabelText('Phone'), typed);
    expect(onValue).toHaveBeenLastCalledWith('+923001234567');
  });

  it('keeps what is typed in the box while it sends the E.164 value up', async () => {
    await render(<Harness />);
    await fireEvent.changeText(screen.getByLabelText('Phone'), '0300 1234567');
    expect(screen.getByDisplayValue('0300 1234567')).toBeTruthy();
  });

  it('leaves another country\'s number as that country\'s', async () => {
    const onValue = jest.fn();
    await render(<Harness onValue={onValue} />);
    await fireEvent.changeText(screen.getByLabelText('Phone'), '+1 415 555 2671');
    expect(onValue).toHaveBeenLastCalledWith('+14155552671');
  });

  it('sends the typed text up while it is not yet a number, so the form fails on it', async () => {
    const onValue = jest.fn();
    await render(<Harness onValue={onValue} />);
    await fireEvent.changeText(screen.getByLabelText('Phone'), '0300 12');
    expect(onValue).toHaveBeenLastCalledWith('0300 12');
  });

  it('says what is wrong, inline, once the person leaves a field holding a half number', async () => {
    await render(<Harness />);
    await fireEvent.changeText(screen.getByLabelText('Phone'), '0300 12');
    expect(screen.queryByText('Enter a phone number like 0300 1234567')).toBeNull();
    await fireEvent(screen.getByLabelText('Phone'), 'blur');
    expect(screen.getByText('Enter a phone number like 0300 1234567')).toBeTruthy();
  });

  it('shows a value that arrives from outside, such as a loaded profile or a reset form', async () => {
    const { rerender } = await render(<PhoneInput value={null} onChange={() => {}} />);
    await rerender(<PhoneInput value="+923331112223" onChange={() => {}} />);
    expect(screen.getByDisplayValue('+923331112223')).toBeTruthy();
  });

  it('asks the phone to fill and to show the phone keyboard', async () => {
    await render(<PhoneInput value={null} onChange={() => {}} />);
    const input = screen.getByLabelText('Phone');
    expect(input.props.keyboardType).toBe('phone-pad');
    expect(input.props.autoComplete).toBe('tel');
  });
});

describe('isValidE164', () => {
  it.each([
    ['+923001234567', true],
    ['+14155552671', true],
    ['923001234567', false], // missing +
    ['+0123456789', false], // leading 0 after +
    ['+92300', false], // too short
    ['+9230012345', false], // the right shape, but not a number that exists
    ['not a number', false],
    ['', false],
  ])('isValidE164(%s) === %s', (value, expected) => {
    expect(isValidE164(value)).toBe(expected);
  });
});
