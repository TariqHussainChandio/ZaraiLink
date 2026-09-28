import React from 'react';
import { useAuthStore } from '../state/authStore';
import { BuyerDashboardScreen } from '../buyer/screens/DashboardScreen';
import { DealerDashboardScreen } from '../dealer/screens/DashboardScreen';
import { FarmerDashboardScreen } from '../farmer/screens/DashboardScreen';

// Admin and Expert render their own dedicated dashboards inside AdminNavigator/ExpertNavigator
// and never reach this component.
export function HomeDashboardScreen() {
  const role = useAuthStore(state => state.role);

  switch (role) {
    case 'farmer':
      return <FarmerDashboardScreen />;
    case 'dealer':
      return <DealerDashboardScreen />;
    case 'buyer':
      return <BuyerDashboardScreen />;
    default:
      return null;
  }
}
