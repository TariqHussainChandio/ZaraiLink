import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NavigatorScreenParams, ParamListBase } from '@react-navigation/native';

/** The screens of the stack a tab holds, from the tab's own param entry (`NavigatorScreenParams<Stack> | undefined`). */
type StackOf<TabParams> = NonNullable<TabParams> extends NavigatorScreenParams<infer Stack> ? Stack : never;

/** `[params]` when the screen needs them, `[params?]` when it takes none. */
type ParamsArg<P> = undefined extends P ? [params?: P] : [params: P];

/**
 * Opens a screen inside ANOTHER tab's own stack, with the tab's first screen kept underneath.
 *
 * `navigation.navigate(tab, { screen })` on a tab that has not been opened yet makes `screen` that tab's FIRST route
 * (React Navigation treats a nested screen named in `navigate` as the navigator's initial one). Back then has nowhere to
 * go inside the tab, and the tab's root can never be reached from there again (audit MK-01, FA-02). `initial: false`
 * says the stack still starts from its own first screen and the named screen is pushed on top.
 *
 * Every jump into another tab goes through here. `tabs` is the bottom-tab navigation (`useAppTabNavigation()`), checked
 * against the tab param lists, so a wrong tab, screen or params shape fails to compile. A missing `tabs` (a screen shown
 * outside the tab shell) does nothing, as the `?.` it replaces did.
 */
export function navigateInTab<
  TabList extends ParamListBase,
  Tab extends keyof TabList & string,
  Screen extends keyof StackOf<TabList[Tab]> & string,
>(
  tabs: BottomTabNavigationProp<TabList> | null | undefined,
  tab: Tab,
  screen: Screen,
  ...[params]: ParamsArg<StackOf<TabList[Tab]>[Screen]>
): void {
  if (!tabs) return;
  // React Navigation's `navigate` is overloaded per route; a nested-screen call has one shape for every tab and screen.
  (tabs as unknown as { navigate: (name: string, options: object) => void }).navigate(tab, { screen, params, initial: false });
}
