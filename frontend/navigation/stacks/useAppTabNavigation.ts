import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import type { AppTabParamList } from './AppNavigator';

/**
 * Screens nested inside a tab's own stack (Marketplace, Orders, Home, ...) get that stack's
 * navigation prop from `useNavigation()`. To jump into a *different* tab's nested stack (e.g.
 * "Message Seller" → Messages tab), go up to the parent bottom-tab navigator first.
 */
export function useAppTabNavigation() {
  const navigation = useNavigation();
  return navigation.getParent<BottomTabNavigationProp<AppTabParamList>>();
}
