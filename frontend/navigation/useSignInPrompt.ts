import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useCallback } from 'react';
import { useLoginNotice } from '../common/auth';
import { AUTH_ROUTES, GUEST_SIGN_IN_TAB } from '../common/constants/routes';
import type { AppTabParamList } from './stacks/AppNavigator';

type Tabs = BottomTabNavigationProp<AppTabParamList> | null | undefined;

/**
 * For a guest (D18): opens the sign-in screen with a line saying why an account is needed here ("Sign in to message the
 * seller"). The sign-in screen shows the line once (loginNotice); creating an account starts from the same screen. Since
 * D20 the guest's sign-in tab starts at the welcome page, so the prompt names Log in, with the welcome page kept under it
 * for Back. The caller passes its tab navigator (`useAppTabNavigation()` or its stack's `getParent()`), read only when it
 * is used.
 */
export function useSignInPrompt(): (tabs: Tabs, title: string, message?: string) => void {
  const leave = useLoginNotice(state => state.leave);
  return useCallback(
    (tabs: Tabs, title: string, message?: string) => {
      leave({ tone: 'info', title, message });
      // The guest's sign-in tab is not one the signed-in tab list describes.
      (tabs as unknown as { navigate: (name: string, options: object) => void } | null | undefined)?.navigate(GUEST_SIGN_IN_TAB, {
        screen: AUTH_ROUTES.Login,
        initial: false,
      });
    },
    [leave],
  );
}
