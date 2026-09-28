import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { Badge } from './Badge';

describe('Badge', () => {
  it('renders its label', async () => {
    await render(<Badge label="Active" />);
    expect(screen.getByText('Active')).toBeTruthy();
  });

  it('defaults to the neutral tone', async () => {
    await render(<Badge label="Neutral" />);
    const text = screen.getByText('Neutral');
    expect(text.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ color: '#434336' })]),
    );
  });
});
