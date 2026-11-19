import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useCallback } from 'react';
import { useLoginNotice } from '../common/auth';
import { APP_TABS } from '../common/constants/routes';
import type { AppTabParamList } from './stacks/AppNavigator';

type Tabs = BottomTabNavigationProp<AppTabParamList> | null | undefined;

/**
 * For a guest (D18): opens the sign-in tab with a line saying why an account is needed here ("Sign in to message the
 * seller"). The sign-in screen shows the line once (loginNotice); creating an account starts from the same screen. The
 * caller passes its tab navigator (`useAppTabNavigation()` or its stack's `getParent()`), read only when it is used.
 */
export function useSignInPrompt(): (tabs: Tabs, title: string, message?: string) => void {
  const leave = useLoginNotice(state => state.leave);
  return useCallback(
    (tabs: Tabs, title: string, message?: string) => {
      leave({ tone: 'info', title, message });
      tabs?.navigate(APP_TABS.Profile);
    },
    [leave],
  );
}
