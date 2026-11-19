import type { NativeStackHeaderProps, NativeStackNavigationOptions } from '@react-navigation/native-stack';
import React from 'react';
import { TopAppBar } from '../common/components';

/** A stack's app-bar actions, by route name: each renders the actions for that screen. */
export type AppBarActions = Partial<Record<string, () => React.ReactNode>>;

/** Which system a stack belongs to. The dealer's inventory system (SRDS §15–§17) marks every screen as a separate app,
 * so a dealer always knows which system they are in. */
export type StackSystem = 'marketplace' | 'inventory';

function StackHeader({
  navigation,
  route,
  options,
  back,
  actions,
  system,
}: NativeStackHeaderProps & { actions: AppBarActions; system: StackSystem }) {
  const title = typeof options.headerTitle === 'string' ? options.headerTitle : (options.title ?? route.name);
  // `back` is set on every inner screen, and on the first screen of a stack opened over another one (farmers' and
  // buyers' full-screen Messages: native-stack passes the parent's Back down), where goBack closes the overlay. A tab's
  // first screen has none and gets the large title.
  // headerBackVisible: false keeps a mid-flow screen (analysing a photo, paying) from offering Back, as the native
  // header did; it is still an inner screen, so it keeps the inner title rather than the large tab-root title.
  const onBack = options.headerBackVisible === false || !back ? undefined : navigation.goBack;
  const right = actions[route.name]?.();
  const variant = system === 'inventory' ? 'inventory' : back ? 'default' : 'large';
  return <TopAppBar title={title} variant={variant} onBack={onBack} right={right} />;
}

/** Every stack draws the design system's app bar: large on a tab's first screen, with back on the rest. A screen's
 * actions come from here, not from React Navigation's header-right option: native-stack also hands that option to its
 * hidden native header, which mounted every action twice (two notification bells opened the same realtime channel).
 * The reality gate's header-right rule keeps the option out of the app. */
export function stackOptionsWithActions(
  actions: AppBarActions,
  system: StackSystem = 'marketplace',
): NativeStackNavigationOptions {
  return { header: props => <StackHeader {...props} actions={actions} system={system} /> };
}

/** A stack whose screens have no app-bar actions. */
export const stackScreenOptions = stackOptionsWithActions({});
