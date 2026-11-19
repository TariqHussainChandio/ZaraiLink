import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useInsets } from '../../hooks/useInsets';
import { type Accent, type Theme, useRoleAccent, useTheme } from '../../theme';

/** Each role's bottom navigation (passed as a bottom-tab navigator's `tabBar`): three to five destinations, the active
 * one in the shell's tint. A tab's `tabBarBadge` shows as the amber dot. */
export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const theme = useTheme();
  const accent = useRoleAccent();
  const styles = useMemo(() => makeStyles(theme, accent), [theme, accent]);
  const insets = useInsets();

  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom }]} accessibilityRole="tablist">
      {state.routes.map((route, index) => {
        const descriptor = descriptors[route.key];
        if (!descriptor) return null;
        const { options } = descriptor;
        const focused = state.index === index;
        const label = typeof options.tabBarLabel === 'string' ? options.tabBarLabel : (options.title ?? route.name);
        const colour = focused ? accent.ink : theme.colors.ink2;
        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
        };
        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={options.tabBarBadge ? `${label}, new` : label}
            testID={options.tabBarButtonTestID}
            // Every tab ripples when pressed (D15); the tab fills its slot, so the ripple is its whole 64 dp cell.
            android_ripple={{ color: theme.colors.ripple }}
            style={styles.tab}
          >
            <View style={[styles.pill, focused && styles.pillActive]}>
              {options.tabBarIcon?.({ focused, color: colour, size: theme.size.iconMd })}
              {options.tabBarBadge ? <View style={styles.dot} /> : null}
            </View>
            {/* Five tabs at a large font scale do not fit "Moderation" whole; the label shrinks a little to fit instead of
                being cut to "Moderat..". TalkBack reads the full label either way. */}
            <Text style={[styles.label, { color: colour }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function makeStyles({ colors, space, size, radius, borders, components, typography, fontWeight }: Theme, accent: Accent) {
  return StyleSheet.create({
    bar: { flexDirection: 'row', backgroundColor: colors.surface, borderTopWidth: borders.hairline, borderTopColor: colors.line },
    tab: { flex: 1, minHeight: size.tabBar, alignItems: 'center', justifyContent: 'center', gap: space[1], paddingVertical: space[2], paddingHorizontal: space[1] },
    // The pill always has a background (the bar's own surface when not selected): on Android a view that gains its first
    // background after mount drew square corners, so a tab selected later showed a square highlight (seen on the emulator).
    pill: {
      width: components.tab.pill.width,
      height: components.tab.pill.height,
      borderRadius: radius.pill,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pillActive: { backgroundColor: accent.soft },
    dot: {
      position: 'absolute',
      top: 0,
      right: space[2],
      width: size.dot,
      height: size.dot,
      borderRadius: radius.pill,
      // The amber alone is 2:1 on the surface; the ring gives the only visual "new" cue its 3:1 edge (WCAG 1.4.11).
      backgroundColor: colors.module.notifications,
      borderWidth: borders.selected,
      borderColor: colors.module.notificationsInk,
    },
    label: { ...typography.caption, fontWeight: fontWeight.semibold },
  });
}
