import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { Avatar } from './Avatar';

describe('Avatar', () => {
  it('renders an image when a uri is given', async () => {
    await render(<Avatar uri="https://example.com/photo.jpg" name="Farmer Test" />);
    expect(screen.queryByText('FT')).toBeNull();
  });

  it('falls back to initials from a two-word name', async () => {
    await render(<Avatar name="Farmer Test" />);
    expect(screen.getByText('FT')).toBeTruthy();
  });

  it('caps initials at the first two words', async () => {
    await render(<Avatar name="First Middle Last" />);
    expect(screen.getByText('FM')).toBeTruthy();
  });

  it('uses a single initial for a one-word name', async () => {
    await render(<Avatar name="Farmer" />);
    expect(screen.getByText('F')).toBeTruthy();
  });

  it('falls back to "?" when there is no name', async () => {
    await render(<Avatar />);
    expect(screen.getByText('?')).toBeTruthy();
  });
});
