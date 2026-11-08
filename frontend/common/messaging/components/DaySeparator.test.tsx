import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { DaySeparator } from './DaySeparator';

describe('DaySeparator', () => {
  it('is a heading with the day, so a screen reader can jump between days', async () => {
    await render(<DaySeparator label="8 Nov" />);
    expect(screen.getByRole('header')).toHaveTextContent('8 Nov');
  });
});
