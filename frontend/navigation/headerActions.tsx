import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useNavigation, type ParamListBase } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MessageCircle, Palette, Plus, ScanLine, Search, ShoppingCart } from 'lucide-react-native';
import React from 'react';
import { IconButton } from '../common/components';
import { APP_TABS, CONSULTATIONS_ROUTES, HOME_ROUTES, MARKETPLACE_ROUTES, PROFILE_ROUTES } from '../common/constants/routes';
import { NotificationBellButton } from '../common/notifications';
import { useUnreadConversationCount } from './useUnreadConversationCount';
import { useAuthStore } from '../state/authStore';
import { cartItemCount, useCartStore } from '../state/cartStore';
import { navigateInTab } from './navigateInTab';
import { useAppTabNavigation } from './stacks/useAppTabNavigation';

// The actions stacks put in their app bars (stackOptionsWithActions in stackHeader.tsx). Each is a module-level
// component that finds its navigator with useNavigation (a header renders inside its screen's navigation context),
// and each render function is defined once here, not inside a navigator: a component created during render remounts
// on every render (react/no-unstable-nested-components).

type StackNavigation = NativeStackNavigationProp<ParamListBase>;

/** The bell on a Home or Overview screen. Every role's home stack names the list screen `Notifications`. */
function NotificationsAction() {
  const navigation = useNavigation<StackNavigation>();
  return <NotificationBellButton onPress={() => navigation.navigate(HOME_ROUTES.Notifications)} />;
}

/** Home: Messages for farmers and buyers (they have no Messages tab; chat opens full-screen), then the bell. */
function HomeActions() {
  const role = useAuthStore(state => state.role);
  const navigation = useNavigation<StackNavigation>();
  // A dealer has a Messages tab of its own; the count is only asked for where the button is shown.
  const unread = useUnreadConversationCount(role !== 'dealer');
  return (
    <>
      {role === 'dealer' ? null : (
        <IconButton
          icon={MessageCircle}
          label="Messages"
          count={unread}
          onPress={() => navigation.getParent<BottomTabNavigationProp<ParamListBase>>()?.navigate(APP_TABS.Messages)}
        />
      )}
      <NotificationsAction />
    </>
  );
}

/** A farmer's Advisory and a buyer's Experts tab: find a verified expert; for farmers also the disease scan (SRDS rule
 * 22), which opens from here as well as from Home. */
function ConsultationsActions() {
  const role = useAuthStore(state => state.role);
  const navigation = useNavigation<StackNavigation>();
  const tabs = useAppTabNavigation();
  return (
    <>
      {role === 'farmer' ? (
        // Into Home's own stack with Home's first screen kept underneath, so Back from the scan returns to Home.
        <IconButton icon={ScanLine} label="Check a sick plant" onPress={() => navigateInTab(tabs, APP_TABS.Home, HOME_ROUTES.DiseaseAdvisory)} />
      ) : null}
      <IconButton icon={Search} label="Find an expert" onPress={() => navigation.navigate(CONSULTATIONS_ROUTES.ExpertList)} />
    </>
  );
}

/** Development builds only: the design catalogue, A2's evidence that every component follows the design system. */
function DesignCatalogueAction() {
  const navigation = useNavigation<StackNavigation>();
  return <IconButton icon={Palette} label="Design catalogue" onPress={() => navigation.navigate(PROFILE_ROUTES.DesignCatalogue)} />;
}

/** The cart, with the number of items in it. It goes through the Marketplace tab, so it works from a listing opened in
 * Home's stack as well as from Market's own. */
function CartAction() {
  const tabs = useAppTabNavigation();
  const count = useCartStore(state => cartItemCount(state.items));
  return (
    <IconButton
      icon={ShoppingCart}
      label="Cart"
      count={count}
      countLabel={n => (n === 1 ? '1 item' : `${n} items`)}
      onPress={() => navigateInTab(tabs, APP_TABS.Marketplace, MARKETPLACE_ROUTES.Cart)}
    />
  );
}

/** Browse: a seller (farmer or dealer) starts a listing from the app bar; a buyer sees only the cart. */
function BrowseActions() {
  const role = useAuthStore(state => state.role);
  const navigation = useNavigation<StackNavigation>();
  return (
    <>
      {role === 'farmer' || role === 'dealer' ? (
        <IconButton icon={Plus} label="New listing" onPress={() => navigation.navigate(MARKETPLACE_ROUTES.CreateListing)} />
      ) : null}
      <CartAction />
    </>
  );
}

export const notificationsAction = () => <NotificationsAction />;
export const homeActions = () => <HomeActions />;
export const consultationsActions = () => <ConsultationsActions />;
export const cartAction = () => <CartAction />;
export const browseActions = () => <BrowseActions />;
export const designCatalogueAction = __DEV__ ? () => <DesignCatalogueAction /> : undefined;
