import React from 'react';
import { render, screen } from '@testing-library/react-native';
import '../../localization';
import { SplashScreen } from './SplashScreen';

describe('SplashScreen', () => {
  it('renders the app name and a spinner', async () => {
    await render(<SplashScreen />);
    expect(screen.getByText('ZaraiLink')).toBeTruthy();
    expect(screen.getByTestId('spinner')).toBeTruthy();
  });
});
