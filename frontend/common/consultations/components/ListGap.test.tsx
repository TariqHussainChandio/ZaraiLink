import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { ListGap } from './ListGap';
import { lightTheme } from '../../../theme';

describe('ListGap', () => {
  it('is as tall as the space between cards', async () => {
    await render(<ListGap />);
    expect(screen.toJSON()).toMatchObject({ props: { style: { height: lightTheme.space[3] } } });
  });
});
