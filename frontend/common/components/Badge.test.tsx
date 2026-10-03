import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { lightColors } from '../../theme';
import { Badge } from './Badge';

describe('Badge', () => {
  it('renders its label', async () => {
    await render(<Badge label="Active" />);
    expect(screen.getByText('Active')).toBeTruthy();
  });

  it('defaults to the neutral tone', async () => {
    await render(<Badge label="Neutral" />);
    expect(screen.getByText('Neutral').props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ color: lightColors.status.neutral.ink })]),
    );
  });

  it('draws danger as a solid block with on-accent text', async () => {
    await render(<Badge label="Rejected" tone="danger" />);
    expect(screen.getByText('Rejected').props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ color: lightColors.onAccent })]),
    );
  });
});
