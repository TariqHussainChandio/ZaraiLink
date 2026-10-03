import { ArrowLeft, Warehouse, type LucideIcon } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  /** large: tab roots, with a headline title; inventory: every screen of the dealer's inventory system (SRDS §15–§17). */
  variant?: 'default' | 'large' | 'inventory';
}

/** A 48 dp icon button with a spoken label, and the amber count badge when `count` is set. */
const unread = (count: number) => `${count} unread`;

export function IconButton({ icon: Icon, label, onPress, count, countLabel = unread }: AppBarAction) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={count ? `${label}, ${countLabel(count)}` : label} style={styles.iconButton}>
      <Icon color={theme.colors.ink} size={theme.size.iconMd} />
      {count ? (
        <View style={styles.count}>
          <Text style={styles.countText}>{count > 99 ? '99+' : count}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** Names the screen and holds back and up to three actions. The inventory variant marks the Dealer Inventory
 * Management System as a separate app: a dealer band on top and an "Inventory system" kicker above the title. */
export function TopAppBar({ title, subtitle, onBack, actions = [], right, variant = 'default' }: TopAppBarProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const large = variant === 'large';

  return (
    <View style={[styles.bar, { paddingTop: insets.top }]}>
      {/* Below the status bar, not behind it: the strip is part of the app bar. */}
      {variant === 'inventory' ? <View style={styles.band} /> : null}
      <View style={styles.row}>
        {onBack ? <IconButton icon={ArrowLeft} label="Back" onPress={onBack} /> : <View style={styles.inset} />}
        <View style={styles.titleBox}>
          {variant === 'inventory' ? (
            <View style={styles.system}>
              <Warehouse color={theme.colors.accent.dealer.ink} size={theme.size.iconSm} />
              <Text style={styles.systemText}>Inventory system</Text>
            </View>
          ) : null}
          {large ? null : (
            <Text style={styles.title} numberOfLines={1} accessibilityRole="header">
              {title}
            </Text>
          )}
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
  );
}

function makeStyles({ colors, space, size, radius, borders, typography }: Theme) {
  return StyleSheet.create({
    bar: { backgroundColor: colors.surface, borderBottomWidth: borders.hairline, borderBottomColor: colors.line },
    // A strip in the dealer mark across the top of every inventory-system screen.
    band: { height: borders.band, backgroundColor: colors.accent.dealer.mark },
    row: { flexDirection: 'row', alignItems: 'center', minHeight: size.appBar, paddingHorizontal: space[1] },
    inset: { width: space[3] },
    titleBox: { flex: 1, minWidth: 0, paddingHorizontal: space[2] },
    title: { ...typography.title, color: colors.ink },
    system: { flexDirection: 'row', alignItems: 'center', gap: space[1] },
    systemText: { ...typography.overline, color: colors.accent.dealer.ink },
    largeTitle: { paddingHorizontal: space[4], paddingBottom: space[3] },
    headline: { ...typography.headline, color: colors.ink },
    subtitle: { ...typography.caption, color: colors.ink2 },
    iconButton: { width: size.touchMin, height: size.touchMin, alignItems: 'center', justifyContent: 'center' },
    count: {
      position: 'absolute',
      top: space[1],
      right: space[1],
      minWidth: size.countBadge,
      height: size.countBadge,
      paddingHorizontal: space[1],
      borderRadius: radius.pill,
      backgroundColor: colors.module.notifications,
      alignItems: 'center',
      justifyContent: 'center',
    },
    countText: { ...typography.code, color: colors.module.onNotifications },
  });
}
