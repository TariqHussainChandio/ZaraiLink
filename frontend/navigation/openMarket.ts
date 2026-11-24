// Helper that opens the market's Browse screen from any stack.
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { ParamListBase } from '@react-navigation/native';
import { APP_TABS, MARKETPLACE_ROUTES } from '../common/constants/routes';
import { navigateInTab } from './navigateInTab';
import type { AppTabParamList } from './stacks/AppNavigator';

interface StackLike {
  navigate: (name: typeof MARKETPLACE_ROUTES.Browse) => void;
  getState?: () => { routeNames: string[] } | undefined;
  getParent: <T>() => T | undefined;
}

/**
 * Back to the market from the cart flow ("Browse the market"). In the market's own stack that is its first screen; in the
 * buyer's Cart tab (D20), whose stack has no Browse, it is the Market tab.
 */
export function openMarket(navigation: StackLike): void {
  const inMarketStack = navigation.getState?.()?.routeNames.includes(MARKETPLACE_ROUTES.Browse) ?? true;
  if (inMarketStack) {
    navigation.navigate(MARKETPLACE_ROUTES.Browse);
    return;
  }
  navigateInTab(navigation.getParent<BottomTabNavigationProp<AppTabParamList & ParamListBase>>(), APP_TABS.Marketplace, MARKETPLACE_ROUTES.Browse);
}
