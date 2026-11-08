import React, { createRef } from 'react';
import { StyleSheet, type TextInput } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { lightTheme } from '../../theme';
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

  it('hides a password and shows it again from a labelled Show / Hide toggle', async () => {
    await render(<TextField label="Password" secureTextEntry defaultValue="secret123" />);
    expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(true);
    await fireEvent.press(screen.getByRole('button', { name: 'Show password' }));
    expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(false);
    await fireEvent.press(screen.getByRole('button', { name: 'Hide password' }));
    expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(true);
  });

  it('offers no toggle on an ordinary field', async () => {
    await render(<TextField label="Email" />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('passes the autofill hints to the input, so a password manager can fill it', async () => {
    await render(<TextField label="Email" autoComplete="email" textContentType="emailAddress" keyboardType="email-address" />);
    const input = screen.getByLabelText('Email');
    expect(input.props.autoComplete).toBe('email');
    expect(input.props.textContentType).toBe('emailAddress');
  });

  it('forwards its ref to the input, so react-hook-form can focus the first invalid field', async () => {
    const ref = createRef<TextInput>();
    await render(<TextField ref={ref} label="Email" />);
    expect(typeof ref.current?.focus).toBe('function');
  });

  it('sets a numeric value in the board face with tabular figures', async () => {
    await render(<TextField label="Price" numeric defaultValue="4200" />);
    const style = StyleSheet.flatten(screen.getByLabelText('Price').props.style);
    expect(style.fontFamily).toBe(lightTheme.typography.figure.fontFamily);
    expect(style.fontVariant).toEqual(['tabular-nums']);
  });
});
