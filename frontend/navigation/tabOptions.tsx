import type { BottomTabBarProps, BottomTabNavigationOptions } from '@react-navigation/bottom-tabs';
import type { LucideIcon } from 'lucide-react-native';
import React from 'react';
import { CircleUserRound } from 'lucide-react-native';
import { Avatar, TabBar } from '../common/components';
import { useAuthStore } from '../state/authStore';

// Built once per module, not inside a navigator's render: a function component created during render is a new type each
// time, so React would remount the tab bar and every icon on each render (react/no-unstable-nested-components).

/** Every shell draws the design system's tab bar. */
export function renderTabBar(props: BottomTabBarProps) {
  return <TabBar {...props} />;
}

/** The farmer's shell (D20): larger icons and words, for literacy-friendly navigation. */
export function renderLargeTabBar(props: BottomTabBarProps) {
  return <TabBar {...props} large />;
}

/** No bottom bar: the guest (D20) moves by the app-bar buttons, the admin by the menu under the app bar. */
export function renderNoTabBar() {
  return null;
}

/** A tab's title and Lucide icon; the tab bar supplies the colour (the role accent when selected) and the size. */
export function tabOptions(title: string, Icon: LucideIcon): BottomTabNavigationOptions {
  return { title, tabBarIcon: ({ color, size }) => <Icon color={color} size={size} /> };
}

/** The Profile tab's picture (D20): the person's own photo once they have one, the profile mark until then. */
function ProfileTabIcon({ color, size }: { color: string; size: number }) {
  const profile = useAuthStore(state => state.profile);
  if (!profile?.avatar_url) return <CircleUserRound color={color} size={size} />;
  return <Avatar uri={profile.avatar_url} name={profile.full_name} role={profile.role} size={size} />;
}

/** A Profile tab whose icon is the person's photo (D20). */
export function profileTabOptions(title: string): BottomTabNavigationOptions {
  return { title, tabBarIcon: ({ color, size }) => <ProfileTabIcon color={color} size={size} /> };
}
