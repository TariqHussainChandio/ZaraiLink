import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useNavigation, type ParamListBase } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { CircleUserRound, MessageCircle, Palette, Plus, ScanLine, Search, ShoppingCart, Warehouse } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Avatar, IconButton } from '../common/components';
import { APP_TABS, AUTH_ROUTES, GUEST_SIGN_IN_TAB, CONSULTATIONS_ROUTES, HOME_ROUTES, MARKETPLACE_ROUTES, PROFILE_ROUTES } from '../common/constants/routes';
import { NotificationBellButton } from '../common/notifications';
import { useUnreadConversationCount } from './useUnreadConversationCount';
import { useStockAlerts } from '../inventory';
import { selectAccount, useAuthStore } from '../state/authStore';
import { cartItemCount, useCartStore } from '../state/cartStore';
import { type Theme, useTheme } from '../theme';
import { navigateInTab } from './navigateInTab';
import { useAppTabNavigation } from './stacks/useAppTabNavigation';
import { useOpenInventorySystem } from './stacks/useOpenInventorySystem';

// The actions stacks put in their app bars (stackOptionsWithActions in stackHeader.tsx). Each is a module-level
// component that finds its navigator with useNavigation (a header renders inside its screen's navigation context),
// and each render function is defined once here, not inside a navigator: a component created during render remounts
// on every render (react/no-unstable-nested-components).

type StackNavigation = NativeStackNavigationProp<ParamListBase>;

/** The bell. Every shell's Home tab holds the list screen as `Notifications`, so the bell opens it there from any tab's
 * app bar (a buyer has it on every tab, D20), with Home's first screen kept underneath for Back. */
function NotificationsAction() {
  const tabs = useAppTabNavigation();
  // D20: an approved dealer's bell counts the inventory system's stock alerts too; they are read in the same list.
  const stockAlertsAllowed = useAuthStore(state => state.role === 'dealer' && selectAccount(state)?.account_status === 'approved');
  const { data: stockAlerts = [] } = useStockAlerts(stockAlertsAllowed);
  return (
    <NotificationBellButton
      extra={stockAlertsAllowed ? stockAlerts.length : 0}
      onPress={() => navigateInTab(tabs, APP_TABS.Home, HOME_ROUTES.Notifications)}
    />
  );
}

/** The dealer's way into the inventory system (D20), in their home's app bar: the home itself is the marketplace shop,
 * and stock is handled in the inventory system (SRDS §15–§17). Only an approved dealer has it (BR-03/04). */
function InventorySystemAction() {
  const allowed = useAuthStore(state => state.role === 'dealer' && selectAccount(state)?.account_status === 'approved');
  const openInventorySystem = useOpenInventorySystem();
  return allowed ? <IconButton icon={Warehouse} label="Open inventory system" onPress={openInventorySystem} /> : null;
}

/** The profile button in the app bar's leading corner (D20). A guest's opens the welcome page with Sign up and Log in;
 * a signed-in person's shows their own photo (their initials until they add one) and opens their Account tab. Every
 * signed-in shell names that tab `Profile`. */
function ProfileAction() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const guest = useAuthStore(state => state.status !== 'authenticated');
  const profile = useAuthStore(state => state.profile);
  const tabs = useAppTabNavigation();
  const open = () => {
    if (!guest) {
      tabs?.navigate(APP_TABS.Profile);
      return;
    }
    // The guest's sign-in tab holds the sign-in stack; naming Welcome brings it back to its first page even after the
    // guest went on to Log in earlier.
    (tabs as unknown as { navigate: (name: string, options: object) => void } | undefined)?.navigate(GUEST_SIGN_IN_TAB, {
      screen: AUTH_ROUTES.Welcome,
    });
  };
  if (guest || !profile) return <IconButton icon={CircleUserRound} label={guest ? 'Sign up or log in' : 'Your profile'} onPress={open} />;
  return (
    <Pressable
      onPress={open}
      accessibilityRole="button"
      accessibilityLabel="Your profile"
      android_ripple={{ color: theme.colors.rippleOnFill, borderless: true, radius: theme.size.touchMin / 2 }}
      style={styles.profileButton}
    >
      <Avatar uri={profile.avatar_url} name={profile.full_name} role={profile.role} size={theme.size.avatarSm} />
    </Pressable>
  );
}

/** Home: Messages for farmers and buyers (they have no Messages tab; chat opens full-screen), then the bell. */
function HomeActions() {
  const role = useAuthStore(state => state.role);
  const navigation = useNavigation<StackNavigation>();
  // A dealer has a Messages tab of its own; the count is only asked for where the button is shown.
  const unread = useUnreadConversationCount(role !== 'dealer');
  return (
    <>
      {role === 'dealer' ? <InventorySystemAction /> : (
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
  // A buyer's cart is a tab of its own (D20), so their app bars do not repeat it.
  const isBuyer = useAuthStore(state => state.role === 'buyer');
  if (isBuyer) return null;
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

/** Browse: a seller (farmer or dealer) starts a listing from the app bar beside the cart; a guest sees the cart; a buyer
 * has Messages and the bell, as on every tab of theirs (D20). */
function BrowseActions() {
  const role = useAuthStore(state => state.role);
  const navigation = useNavigation<StackNavigation>();
  if (role === 'buyer') return <HomeActions />;
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
export const profileAction = () => <ProfileAction />;

/** The guest's market is their home, so it carries the profile button (Sign up, Log in); a signed-in person's photo is
 * on their own home screen only (D20), so for them the market's leading corner stays empty. */
function GuestProfileAction() {
  const guest = useAuthStore(state => state.status !== 'authenticated');
  return guest ? <ProfileAction /> : null;
}
export const guestProfileAction = () => <GuestProfileAction />;
export const homeActions = () => <HomeActions />;
export const consultationsActions = () => <ConsultationsActions />;
export const cartAction = () => <CartAction />;
export const browseActions = () => <BrowseActions />;
export const designCatalogueAction = __DEV__ ? () => <DesignCatalogueAction /> : undefined;

function makeStyles({ size }: Theme) {
  return StyleSheet.create({
    // The photo is drawn small (avatarSm) inside the 48 dp target every app-bar button has.
    profileButton: { width: size.touchMin, height: size.touchMin, alignItems: 'center', justifyContent: 'center' },
  });
}
