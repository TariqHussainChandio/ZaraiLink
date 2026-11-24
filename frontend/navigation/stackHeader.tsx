// The custom app bar every stack uses, and the helper that sets its actions per screen.
import type { NativeStackHeaderProps, NativeStackNavigationOptions } from '@react-navigation/native-stack';
import React from 'react';
import { TopAppBar } from '../common/components';
import { ROLE_LABELS } from '../common/constants/roles';
import { useAuthStore } from '../state/authStore';

/** A stack's app-bar actions, by route name: each renders the actions for that screen. */
export type AppBarActions = Partial<Record<string, () => React.ReactNode>>;

/** Which system a stack belongs to. The dealer's inventory system (SRDS §15–§17) marks every screen as a separate app,
 * so a dealer always knows which system they are in. */
export type StackSystem = 'marketplace' | 'inventory';

// Draws the app bar for a stack screen: title, back, leading and trailing actions.
function StackHeader({
  navigation,
  route,
  options,
  back,
  actions,
  leading,
  below,
  system,
}: NativeStackHeaderProps & { actions: AppBarActions; leading: AppBarActions; below: AppBarActions; system: StackSystem }) {
  const role = useAuthStore(state => (state.status === 'authenticated' ? state.role : null));
  const title = typeof options.headerTitle === 'string' ? options.headerTitle : (options.title ?? route.name);
  // `back` is set on every inner screen, and on the first screen of a stack opened over another one (farmers' and
  // buyers' full-screen Messages: native-stack passes the parent's Back down), where goBack closes the overlay. A tab's
  // first screen has none and gets the large title.
  // headerBackVisible: false keeps a mid-flow screen (analysing a photo, paying) from offering Back, as the native
  // header did; it is still an inner screen, so it keeps the inner title rather than the large tab-root title.
  const onBack = options.headerBackVisible === false || !back ? undefined : navigation.goBack;
  const right = actions[route.name]?.();
  const left = leading[route.name]?.();
  const under = below[route.name]?.();
  // D20: a person's bar (a home screen or the Account, marked headerLargeTitle: false) keeps the title, their name, in the
  // row beside their photo, with their role on the line beneath it.
  const personBar = options.headerLargeTitle === false && !back;
  // D20: every bar has the home bar's compact height, the title in the row; the large title below the row is retired.
  const variant = system === 'inventory' ? 'inventory' : 'default';
  const subtitle = personBar && role ? ROLE_LABELS[role] : undefined;
  return (
    <TopAppBar
      title={title}
      subtitle={subtitle}
      variant={variant}
      onBack={onBack}
      right={right}
      left={left}
      below={under}
      centered={options.headerTitleAlign === 'center'}
    />
  );
}

/** Every stack draws the design system's app bar: large on a tab's first screen, with back on the rest. A screen's
 * actions come from here, not from React Navigation's header-right option: native-stack also hands that option to its
 * hidden native header, which mounted every action twice (two notification bells opened the same realtime channel).
 * The reality gate's header-right rule keeps the option out of the app. */
export function stackOptionsWithActions(
  actions: AppBarActions,
  system: StackSystem = 'marketplace',
  leading: AppBarActions = {},
  below: AppBarActions = {},
): NativeStackNavigationOptions {
  return { header: props => <StackHeader {...props} actions={actions} leading={leading} below={below} system={system} /> };
}

/** A stack whose screens have no app-bar actions. */
export const stackScreenOptions = stackOptionsWithActions({});
