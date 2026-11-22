import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { useCallback } from 'react';
import type { MarketRootParamList } from './AppNavigator';

/**
 * Opens the dealer's inventory system from any screen inside the dealer shell. The route lives on the root stack
 * (over the tabs), and React Navigation hands a `navigate` for a route the current stack does not know up to its
 * parents, so a screen nested in a tab's stack reaches it without walking `getParent()` by hand. The route exists only
 * for dealers (BR-03/04); call this only from dealer screens.
 */
export function useOpenInventorySystem(): () => void {
  const navigation = useNavigation<NavigationProp<MarketRootParamList>>();
  return useCallback(() => navigation.navigate('InventorySystem'), [navigation]);
}
