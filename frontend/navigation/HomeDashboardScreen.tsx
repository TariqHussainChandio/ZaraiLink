import React from 'react';
import { useAuthStore } from '../store/authStore';
import { BuyerDashboardScreen } from './buyer/DashboardScreen';
import { DealerDashboardScreen } from './dealer/DashboardScreen';
import { FarmerDashboardScreen } from './farmer/DashboardScreen';

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
