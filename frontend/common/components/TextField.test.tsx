import React, { createRef } from 'react';
import type { TextInput } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { TextField } from './TextField';

describe('TextField', () => {
  it('renders the label when given', async () => {
    await render(<TextField label="Email" placeholder="you@example.com" />);
    expect(screen.getByText('Email')).toBeTruthy();
  });

  it('omits the label when not given', async () => {
    await render(<TextField placeholder="you@example.com" />);
    expect(screen.queryByText('Email')).toBeNull();
  });

  it('renders the error message when given', async () => {
    await render(<TextField label="Email" error="Enter a valid email" />);
    expect(screen.getByText('Enter a valid email')).toBeTruthy();
  });

  it('omits the error message when not given', async () => {
    await render(<TextField label="Email" />);
    expect(screen.queryByText(/valid email/)).toBeNull();
  });

  it('calls onChangeText as the user types', async () => {
    const onChangeText = jest.fn();
    await render(<TextField placeholder="you@example.com" onChangeText={onChangeText} />);
    await fireEvent.changeText(screen.getByPlaceholderText('you@example.com'), 'farmer@example.com');
    expect(onChangeText).toHaveBeenCalledWith('farmer@example.com');
  });

  it('focuses the input from a tap anywhere in the box, and still hands the caller its ref', async () => {
    const ref = createRef<TextInput>();
    await render(<TextField ref={ref} label="Price" prefix="Rs" suffix="per bag" />);
    expect(ref.current).toBeTruthy();
    // The Jest TextInput shares one focus mock between instances; start this test's count at zero.
    const focus = jest.spyOn(ref.current as TextInput, 'focus').mockClear();

    // The prefix and the suffix sit in the box beside the input, as its border does.
    await fireEvent.press(screen.getByText('Rs'));
    await fireEvent.press(screen.getByText('per bag'));
    expect(focus).toHaveBeenCalledTimes(2);
  });

  it('does not focus a read-only field', async () => {
    const ref = createRef<TextInput>();
    await render(<TextField ref={ref} label="Price" prefix="Rs" editable={false} />);
    // The Jest TextInput shares one focus mock between instances; start this test's count at zero.
    const focus = jest.spyOn(ref.current as TextInput, 'focus').mockClear();
    await fireEvent.press(screen.getByText('Rs'));
    expect(focus).not.toHaveBeenCalled();
  });
});
