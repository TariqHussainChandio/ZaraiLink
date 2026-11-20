import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useNavigation, useRoute } from '@react-navigation/native';
import {
  BadgeCheck,
  BarChart3,
  Bell,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  FileText,
  Flag,
  KeyRound,
  LayoutDashboard,
  Leaf,
  List,
  LogOut,
  type LucideIcon,
  Menu,
  Receipt,
  Scale,
  ScrollText,
  Sparkles,
  Star,
  Stethoscope,
  Store,
  Tags,
  Users,
  X,
} from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { Animated, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { IconButton } from '../../common/components';
import { ADMIN_HOME_ROUTES, ADMIN_TABS, PROFILE_ROUTES } from '../../common/constants/routes';
import { useInsets } from '../../hooks/useInsets';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { navigateInTab } from '../../navigation/navigateInTab';
import type { AdminTabParamList } from '../../navigation/stacks/AdminNavigator';
import { useAuthStore } from '../../state/authStore';
import { type Theme, useRoleAccent, useTheme, type Accent } from '../../theme';
import { useAdminQueues } from '../hooks/admin';

type Tabs = BottomTabNavigationProp<AdminTabParamList>;
type Queues = NonNullable<ReturnType<typeof useAdminQueues>['data']>;

interface MenuItem {
  label: string;
  icon: LucideIcon;
  /** The screen this item opens, to mark the one the admin is on. */
  route: string;
  go: (tabs: Tabs) => void;
  /** What is waiting there, from the dashboard's queue counts. */
  count?: (queues: Queues) => number;
}

interface MenuGroup {
  title: string;
  items: MenuItem[];
}

// Every admin screen, grouped by what the admin is doing (D19). Each opens in its own tab's stack with the tab's first
// screen underneath (navigateInTab), so Back behaves as it does from the bottom tabs.
const GROUPS: MenuGroup[] = [
  {
    title: 'Overview',
    items: [
      { label: 'Overview', icon: LayoutDashboard, route: ADMIN_HOME_ROUTES.Dashboard, go: t => navigateInTab(t, ADMIN_TABS.Home, ADMIN_HOME_ROUTES.Dashboard) },
      { label: 'Analytics', icon: BarChart3, route: ADMIN_HOME_ROUTES.Analytics, go: t => navigateInTab(t, ADMIN_TABS.Home, ADMIN_HOME_ROUTES.Analytics) },
      { label: 'Notifications', icon: Bell, route: ADMIN_HOME_ROUTES.Notifications, go: t => navigateInTab(t, ADMIN_TABS.Home, ADMIN_HOME_ROUTES.Notifications) },
    ],
  },
  {
    title: 'Approvals',
    items: [
      {
        label: 'Applications',
        icon: BadgeCheck,
        route: ADMIN_HOME_ROUTES.Approvals,
        go: t => navigateInTab(t, ADMIN_TABS.Approvals, ADMIN_HOME_ROUTES.Approvals),
        count: q => q.pending_dealer_applications + q.pending_expert_applications,
      },
      {
        label: 'Required documents',
        icon: FileText,
        route: ADMIN_HOME_ROUTES.RequiredDocuments,
        go: t => navigateInTab(t, ADMIN_TABS.Approvals, ADMIN_HOME_ROUTES.RequiredDocuments),
      },
    ],
  },
  {
    title: 'People and marketplace',
    items: [
      { label: 'Users', icon: Users, route: ADMIN_HOME_ROUTES.UserManagement, go: t => navigateInTab(t, ADMIN_TABS.Moderation, ADMIN_HOME_ROUTES.UserManagement) },
      { label: 'Listings', icon: Store, route: ADMIN_HOME_ROUTES.ListingModeration, go: t => navigateInTab(t, ADMIN_TABS.Moderation, ADMIN_HOME_ROUTES.ListingModeration) },
      { label: 'Orders', icon: Receipt, route: ADMIN_HOME_ROUTES.Orders, go: t => navigateInTab(t, ADMIN_TABS.Moderation, ADMIN_HOME_ROUTES.Orders) },
      {
        label: 'Disputed orders',
        icon: Scale,
        route: `${ADMIN_HOME_ROUTES.Orders}:disputed`,
        go: t => navigateInTab(t, ADMIN_TABS.Moderation, ADMIN_HOME_ROUTES.Orders, { status: 'disputed' }),
        count: q => q.disputed_orders,
      },
      {
        label: 'Reports',
        icon: Flag,
        route: ADMIN_HOME_ROUTES.Reports,
        go: t => navigateInTab(t, ADMIN_TABS.Moderation, ADMIN_HOME_ROUTES.Reports),
        count: q => q.open_reports,
      },
      { label: 'Reviews', icon: Star, route: ADMIN_HOME_ROUTES.ReviewModeration, go: t => navigateInTab(t, ADMIN_TABS.Moderation, ADMIN_HOME_ROUTES.ReviewModeration) },
      {
        label: 'Consultations',
        icon: Stethoscope,
        route: ADMIN_HOME_ROUTES.ConsultationModeration,
        go: t => navigateInTab(t, ADMIN_TABS.Moderation, ADMIN_HOME_ROUTES.ConsultationModeration),
        count: q => q.stale_consultations,
      },
    ],
  },
  {
    title: 'Platform setup',
    items: [
      { label: 'Categories', icon: Tags, route: ADMIN_HOME_ROUTES.Categories, go: t => navigateInTab(t, ADMIN_TABS.Moderation, ADMIN_HOME_ROUTES.Categories) },
      { label: 'Reference data', icon: List, route: ADMIN_HOME_ROUTES.ReferenceData, go: t => navigateInTab(t, ADMIN_TABS.Moderation, ADMIN_HOME_ROUTES.ReferenceData) },
      { label: 'Disease knowledge', icon: Leaf, route: ADMIN_HOME_ROUTES.DiseaseKnowledge, go: t => navigateInTab(t, ADMIN_TABS.Home, ADMIN_HOME_ROUTES.DiseaseKnowledge) },
      { label: 'AI activity', icon: Sparkles, route: ADMIN_HOME_ROUTES.AiActivity, go: t => navigateInTab(t, ADMIN_TABS.Home, ADMIN_HOME_ROUTES.AiActivity) },
    ],
  },
  {
    title: 'Audit',
    items: [
      { label: 'Audit log', icon: ScrollText, route: ADMIN_HOME_ROUTES.AuditLogs, go: t => navigateInTab(t, ADMIN_TABS.Audit, ADMIN_HOME_ROUTES.AuditLogs) },
    ],
  },
  {
    title: 'Account',
    items: [
      { label: 'Account', icon: ClipboardList, route: PROFILE_ROUTES.ViewProfile, go: t => navigateInTab(t, ADMIN_TABS.Profile, PROFILE_ROUTES.ViewProfile) },
      { label: 'Change password', icon: KeyRound, route: PROFILE_ROUTES.ChangePassword, go: t => navigateInTab(t, ADMIN_TABS.Profile, PROFILE_ROUTES.ChangePassword) },
    ],
  },
];

/** The group holding the screen the admin is on starts open; the others start closed, so the menu fits one screen. */
function groupOf(route: string): string {
  return GROUPS.find(group => group.items.some(item => item.route === route))?.title ?? 'Overview';
}

/**
 * The admin's side menu (D19): every admin screen in one place, grouped, each group opening and closing like a
 * dropdown, with what is waiting beside the queues. It slides in from the left over the screen; a tap outside, the close
 * button or the back gesture closes it. The bottom tabs stay for the four main areas.
 */
export function AdminMenu({ onClose, currentRoute }: { onClose: () => void; currentRoute: string }) {
  const theme = useTheme();
  const accent = useRoleAccent();
  const styles = useMemo(() => makeStyles(theme, accent), [theme, accent]);
  const insets = useInsets();
  const window = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const tabs = useNavigation().getParent<Tabs>();
  const signOut = useAuthStore(state => state.signOut);
  const queues = useAdminQueues();
  const [open, setOpen] = useState<Set<string>>(() => new Set([groupOf(currentRoute)]));
  const width = Math.min(theme.components.menu.width, window.width * theme.components.menu.maxShare);
  // Mounted only while open (AdminMenuButton), so every opening starts here: closed groups but the current one, and
  // the slide in from the left (none with reduced motion).
  const [slide] = useState(() => new Animated.Value(reduceMotion ? 1 : 0));

  useEffect(() => {
    if (reduceMotion) return;
    Animated.timing(slide, {
      toValue: 1,
      duration: theme.motion.duration.base,
      easing: theme.motion.easing.decelerate,
      useNativeDriver: true,
    }).start();
  }, [reduceMotion, slide, theme.motion]);

  const toggle = (title: string) =>
    setOpen(previous => {
      const next = new Set(previous);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });

  const choose = (item: MenuItem) => {
    onClose();
    item.go(tabs as Tabs);
  };

  const translateX = slide.interpolate({ inputRange: [0, 1], outputRange: [-width, 0] });

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <Pressable
        testID="admin-menu-backdrop"
        style={[StyleSheet.absoluteFill, styles.scrim]}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close the menu"
        importantForAccessibility="no-hide-descendants"
      />
      <Animated.View
        style={[styles.panel, { width, paddingTop: insets.top, paddingBottom: insets.bottom, transform: [{ translateX }] }]}
        accessibilityViewIsModal
        accessibilityLabel="Admin menu"
      >
        <View style={styles.head}>
          <Text style={styles.headTitle} accessibilityRole="header">
            ZaraiLink admin
          </Text>
          <IconButton icon={X} label="Close the menu" onPress={onClose} />
        </View>
        <ScrollView contentContainerStyle={styles.body}>
          {GROUPS.map(group => {
            const expanded = open.has(group.title);
            const waiting = queues.data ? group.items.reduce((sum, item) => sum + (item.count?.(queues.data) ?? 0), 0) : 0;
            return (
              <View key={group.title} style={styles.group}>
                <Pressable
                  style={styles.groupHead}
                  onPress={() => toggle(group.title)}
                  android_ripple={{ color: theme.colors.ripple }}
                  accessibilityRole="button"
                  accessibilityState={{ expanded }}
                  accessibilityLabel={waiting > 0 ? `${group.title}, ${waiting} waiting` : group.title}
                >
                  <Text style={styles.groupTitle}>{group.title}</Text>
                  {!expanded && waiting > 0 ? <Count value={waiting} styles={styles} /> : null}
                  {expanded ? (
                    <ChevronUp color={theme.colors.ink2} size={theme.size.iconMd} />
                  ) : (
                    <ChevronDown color={theme.colors.ink2} size={theme.size.iconMd} />
                  )}
                </Pressable>
                {expanded
                  ? group.items.map(item => {
                      const current = item.route === currentRoute;
                      const count = queues.data && item.count ? item.count(queues.data) : 0;
                      const Icon = item.icon;
                      return (
                        <Pressable
                          key={item.label}
                          style={[styles.item, current && styles.itemCurrent]}
                          onPress={() => choose(item)}
                          android_ripple={{ color: theme.colors.ripple }}
                          accessibilityRole="menuitem"
                          accessibilityState={{ selected: current }}
                          accessibilityLabel={count > 0 ? `${item.label}, ${count} waiting` : item.label}
                        >
                          <Icon color={current ? accent.ink : theme.colors.ink2} size={theme.size.iconMd} strokeWidth={theme.size.iconStroke} />
                          <Text style={current ? styles.itemLabelCurrent : styles.itemLabel}>{item.label}</Text>
                          {count > 0 ? <Count value={count} styles={styles} /> : null}
                        </Pressable>
                      );
                    })
                  : null}
              </View>
            );
          })}
          <Pressable
            style={styles.item}
            onPress={() => {
              onClose();
              signOut();
            }}
            android_ripple={{ color: theme.colors.ripple }}
            accessibilityRole="menuitem"
            accessibilityLabel="Sign out"
          >
            <LogOut color={theme.colors.ink2} size={theme.size.iconMd} strokeWidth={theme.size.iconStroke} />
            <Text style={styles.itemLabel}>Sign out</Text>
          </Pressable>
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

function Count({ value, styles }: { value: number; styles: ReturnType<typeof makeStyles> }) {
  return (
    <View style={styles.count}>
      <Text style={styles.countText}>{value > 99 ? '99+' : value}</Text>
    </View>
  );
}

/** The menu button on the first screen of every admin tab (AdminNavigator), with what is waiting counted on it. */
export function AdminMenuButton() {
  const route = useRoute();
  const queues = useAdminQueues();
  const [visible, setVisible] = useState(false);
  const q = queues.data;
  const waiting = q ? q.pending_dealer_applications + q.pending_expert_applications + q.open_reports + q.disputed_orders : 0;
  return (
    <>
      <IconButton icon={Menu} label="Open the menu" count={waiting} countLabel={n => `${n} waiting`} onPress={() => setVisible(true)} />
      {visible ? <AdminMenu onClose={() => setVisible(false)} currentRoute={route.name} /> : null}
    </>
  );
}

function makeStyles({ colors, space, size, radius, typography, components, shadows, borders }: Theme, accent: Accent) {
  const { menu } = components;
  return StyleSheet.create({
    scrim: { backgroundColor: colors.scrim },
    panel: { position: 'absolute', top: 0, bottom: 0, left: 0, backgroundColor: colors.surface, ...shadows.elev3 },
    head: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: size.appBar,
      paddingLeft: menu.padding,
      paddingRight: space[1],
      borderBottomWidth: borders.hairline,
      borderBottomColor: colors.line,
    },
    headTitle: { ...typography.titleBar, flex: 1, color: colors.ink },
    body: { paddingVertical: space[2], gap: menu.groupGap },
    group: { gap: menu.groupGap },
    groupHead: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: size.touchMin, paddingHorizontal: menu.padding },
    groupTitle: { ...typography.bodyStrong, flex: 1, color: colors.ink },
    item: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[3],
      minHeight: size.touchMin,
      paddingHorizontal: menu.padding,
      marginHorizontal: space[2],
      borderRadius: radius.sm,
      // A background from the start, so the highlight keeps its corners on Android (Learned the hard way).
      backgroundColor: colors.surface,
    },
    itemCurrent: { backgroundColor: accent.soft },
    itemLabel: { ...typography.body, flex: 1, color: colors.ink },
    itemLabelCurrent: { ...typography.bodyStrong, flex: 1, color: accent.ink },
    count: {
      minWidth: size.countBadge,
      minHeight: size.countBadge,
      paddingHorizontal: space[1],
      borderRadius: radius.pill,
      backgroundColor: colors.module.notifications,
      alignItems: 'center',
      justifyContent: 'center',
    },
    countText: { ...typography.code, color: colors.module.onNotifications },
  });
}
