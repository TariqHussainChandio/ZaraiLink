import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { HomeDashboardScreen } from './HomeDashboardScreen';
import { useAuthStore } from '../store/authStore';

jest.mock('./buyer/DashboardScreen', () => {
  const ReactActual = require('react');
  const { Text } = require('react-native');
  return { BuyerDashboardScreen: () => ReactActual.createElement(Text, null, 'Buyer Dashboard Screen') };
});
jest.mock('./dealer/DashboardScreen', () => {
  const ReactActual = require('react');
  const { Text } = require('react-native');
  return { DealerDashboardScreen: () => ReactActual.createElement(Text, null, 'Dealer Dashboard Screen') };
});
jest.mock('./farmer/DashboardScreen', () => {
  const ReactActual = require('react');
  const { Text } = require('react-native');
  return { FarmerDashboardScreen: () => ReactActual.createElement(Text, null, 'Farmer Dashboard Screen') };
});

describe('HomeDashboardScreen', () => {
  it('renders the farmer dashboard for a farmer', async () => {
    useAuthStore.setState({ role: 'farmer' as never });
    await render(<HomeDashboardScreen />);
    expect(screen.getByText('Farmer Dashboard Screen')).toBeTruthy();
  });

  it('renders the dealer dashboard for a dealer', async () => {
    useAuthStore.setState({ role: 'dealer' as never });
    await render(<HomeDashboardScreen />);
    expect(screen.getByText('Dealer Dashboard Screen')).toBeTruthy();
  });

  it('renders the buyer dashboard for a buyer', async () => {
    useAuthStore.setState({ role: 'buyer' as never });
    await render(<HomeDashboardScreen />);
    expect(screen.getByText('Buyer Dashboard Screen')).toBeTruthy();
  });

  it('renders nothing for an unhandled role', async () => {
    useAuthStore.setState({ role: null });
    const { toJSON } = await render(<HomeDashboardScreen />);
    expect(toJSON()).toBeNull();
  });
});
