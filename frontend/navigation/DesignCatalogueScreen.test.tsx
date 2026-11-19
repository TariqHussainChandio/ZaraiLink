import React from 'react';
import { screen } from '@testing-library/react-native';
import { renderWithProviders } from '../testUtils/renderWithProviders';
import { DesignCatalogueScreen } from './DesignCatalogueScreen';

// The catalogue is the evidence that every shared component draws in the current theme; if one of them breaks, this
// screen stops rendering, so a smoke test here catches a component that no screen has adopted yet.
describe('DesignCatalogueScreen', () => {
  it('renders every section, including the components new in Rate Board', async () => {
    await renderWithProviders(<DesignCatalogueScreen />);
    for (const title of ['Type', 'Rate plates', 'Buttons', 'Fields', 'Quantity', 'Banners and feedback', 'Loading, failed, waiting, empty', 'Sheets and action bar']) {
      expect(screen.getByRole('header', { name: title })).toBeTruthy();
    }
    expect(screen.getByText('Waiting for connection')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'One more bag' }).length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Code from your email')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Show password' })).toBeTruthy();
  });
});
