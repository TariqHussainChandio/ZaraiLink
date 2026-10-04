import React from 'react';
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
});
