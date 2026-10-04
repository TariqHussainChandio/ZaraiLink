import type { BottomTabBarProps, BottomTabNavigationOptions } from '@react-navigation/bottom-tabs';
import type { LucideIcon } from 'lucide-react-native';
import React from 'react';
import { TabBar } from '../common/components';

// Built once per module, not inside a navigator's render: a function component created during render is a new type each
// time, so React would remount the tab bar and every icon on each render (react/no-unstable-nested-components).

/** Every shell draws the design system's tab bar. */
export function renderTabBar(props: BottomTabBarProps) {
  return <TabBar {...props} />;
}

/** A tab's title and Lucide icon; the tab bar supplies the colour (the role accent when selected) and the size. */
export function tabOptions(title: string, Icon: LucideIcon): BottomTabNavigationOptions {
  return { title, tabBarIcon: ({ color, size }) => <Icon color={color} size={size} /> };
}
