import React from 'react';
import { SellerDashboard } from '../../common/analytics';
import { useGreetingTitle } from '../hooks/greeting';

export function FarmerDashboardScreen() {
  // The greeting heading (A8, F1) is the app bar's title, so the shared SellerDashboard body stays as it is.
  useGreetingTitle();
  return <SellerDashboard />;
}
