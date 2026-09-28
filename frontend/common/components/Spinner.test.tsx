import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { Spinner } from './Spinner';

describe('Spinner', () => {
  it('renders an ActivityIndicator', async () => {
    await render(<Spinner />);
    expect(screen.getByTestId('spinner')).toBeTruthy();
  });

  it('defaults to the large size', async () => {
    await render(<Spinner />);
    expect(screen.getByTestId('spinner').props.size).toBe('large');
  });

  it('supports the small size', async () => {
    await render(<Spinner size="small" />);
    expect(screen.getByTestId('spinner').props.size).toBe('small');
  });

  it('renders without crashing in fullscreen mode', async () => {
    await render(<Spinner fullscreen />);
    expect(screen.getByTestId('spinner')).toBeTruthy();
  });
});
