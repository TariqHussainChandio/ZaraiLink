import { ArrowLeft, Warehouse, type LucideIcon } from 'lucide-react-native';
import React, { createContext, useContext, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useInsets } from '../../hooks/useInsets';
import { useStatusBarStyle } from '../../hooks/useStatusBarStyle';
import { type Theme, useTheme } from '../../theme';

export interface AppBarAction {
  icon: LucideIcon;
  /** Spoken by TalkBack; the icon means something on its own here. */
  label: string;
  onPress: () => void;
  /** Shows the amber count badge (unread notifications). */
  count?: number;
  /** How TalkBack says the count; unread by default. */
  countLabel?: (count: number) => string;
}

export interface TopAppBarProps {
  title: string;
  subtitle?: string;
  /** Shows the back arrow: every screen but a tab root. */
  onBack?: () => void;
  /** Up to three actions. */
  actions?: AppBarAction[];
  /** The stack's actions for this screen (navigation/stackHeader.tsx). */
  right?: React.ReactNode;
  /** In the back arrow's place on a tab's first screen, such as the admin's menu button (D19). Ignored when there is a
   * back arrow: an inner screen goes back. */
  left?: React.ReactNode;
  /** large: tab roots, with a headline title; inventory: every screen of the dealer's inventory system (SRDS §15–§17). */
  variant?: 'default' | 'large' | 'inventory';
  /** Under the olive bar, on the paper: the admin's menu bar (D20). Not tinted, since it is not on the bar. */
  below?: React.ReactNode;
  /** The title centred between the leading and trailing buttons, as a name rather than a screen title: the guest's
   * market says "ZaraiLink" there (D20). Takes the place of the large title. */
  centered?: boolean;
}

const unread = (count: number) => `${count} unread`;

/** The colour of icon buttons drawn on a coloured bar. The app bar is olive (D20), so the actions the navigators hand it
 * (the bell, the cart, the profile button) take the bar's `onAppBar` from here instead of each passing a colour. */
const BarTint = createContext<{ icon: string; ripple: string } | null>(null);

/** A 48 dp icon button with a spoken label, and the amber count badge when `count` is set. `color` is for the rare dark
 * ground (the photo viewer); everywhere else the icon is `ink`. */
export function IconButton({ icon: Icon, label, onPress, count, countLabel = unread, color }: AppBarAction & { color?: string }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const tint = useContext(BarTint);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={count ? `${label}, ${countLabel(count)}` : label}
      // A round disc of ripple, as wide as the target: it spills past the icon but not past the 48 dp square.
      android_ripple={{ color: tint?.ripple ?? theme.colors.ripple, borderless: true, radius: theme.size.touchMin / 2 }}
      style={styles.iconButton}
    >
      <Icon color={color ?? tint?.icon ?? theme.colors.ink} size={theme.size.iconMd} />
      {count ? (
        <View style={styles.count}>
          <Text style={styles.countText}>{count > 99 ? '99+' : count}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** Names the screen and holds back and up to three actions. Every ZaraiLink bar is the brand olive (D20). The inventory
 * variant draws the Dealer Inventory Management System as a separate app in earth brown, with the warehouse mark beside
 * the title (the business name on a tab's first screen). */
export function TopAppBar({ title, subtitle, onBack, actions = [], right, left, variant = 'default', below, centered = false }: TopAppBarProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useInsets();
  const large = variant === 'large' && !centered;
  const inventory = variant === 'inventory';
  const tint = useMemo(
    () => ({ icon: inventory ? theme.colors.onAccent : theme.colors.onAppBar, ripple: theme.colors.rippleOnFill }),
    [theme, inventory],
  );
  // Light system icons over the olive bar; over the earth-brown inventory bar they follow its text (dark in dark mode).
  useStatusBarStyle(inventory && theme.dark ? 'dark-content' : 'light-content');

  return (
    <View>
      <BarTint.Provider value={tint}>
        <View style={[inventory ? styles.inventoryBar : styles.bar, { paddingTop: insets.top }]}>
          <View style={styles.row}>
            {onBack ? <IconButton icon={ArrowLeft} label="Back" onPress={onBack} /> : (left ?? <View style={styles.inset} />)}
            {inventory ? (
              <View style={styles.system} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                <Warehouse color={theme.colors.onAccent} size={theme.size.iconMd} />
              </View>
            ) : null}
            <View style={styles.titleBox}>
              {large ? null : (
                <Text
                  style={inventory ? styles.inventoryTitle : centered ? styles.centeredTitle : styles.title}
                  numberOfLines={1}
                  accessibilityRole="header"
                >
                  {title}
                </Text>
              )}
              {/* A home or Account bar (D20) names the person, with their role on the line beneath. */}
              {!large && subtitle ? (
                <Text style={inventory ? styles.inventorySubtitle : styles.subtitle} numberOfLines={1}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
            {actions.map(action => (
              <IconButton key={action.label} {...action} />
            ))}
            {right}
          </View>
          {large ? (
            <View style={styles.largeTitle}>
              <Text style={styles.headline} accessibilityRole="header">
                {title}
              </Text>
              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            </View>
          ) : null}
        </View>
      </BarTint.Provider>
      {below}
    </View>
  );
}

function makeStyles({ colors, space, size, radius, borders, typography }: Theme) {
  return StyleSheet.create({
    bar: { backgroundColor: colors.appBar },
    // The inventory system's own bar (SRDS §16, D20): the brand's second colour, earth brown, so the separate app looks
    // apart from ZaraiLink's olive.
    inventoryBar: { backgroundColor: colors.secondary.fill },
    inventoryTitle: { ...typography.titleBar, color: colors.onAccent },
    inventorySubtitle: { ...typography.caption, color: colors.onAccent },
    row: { flexDirection: 'row', alignItems: 'center', minHeight: size.appBar, paddingHorizontal: space[1] },
    inset: { width: space[3] },
    titleBox: { flex: 1, minWidth: 0, paddingHorizontal: space[2] },
    // The board face (D15): an inner screen's title is `titleBar`, a tab's first screen has the large `headline`.
    title: { ...typography.titleBar, color: colors.onAppBar },
    centeredTitle: { ...typography.titleLg, color: colors.onAppBar, textAlign: 'center' },
    system: { paddingLeft: space[2] },
    largeTitle: { paddingHorizontal: space[4], paddingBottom: space[3] },
    headline: { ...typography.headline, color: colors.onAppBar },
    subtitle: { ...typography.caption, color: colors.onAppBar },
    iconButton: { width: size.touchMin, height: size.touchMin, alignItems: 'center', justifyContent: 'center' },
    // The badge grows with the text (A8: at 130% font a fixed 20 dp box covered the bell), and sits in the corner of the
    // 48 dp target so a larger badge spreads outwards, not over the icon.
    count: {
      position: 'absolute',
      top: 0,
      right: 0,
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
