import React from 'react';
import { ScreenScaffold } from '../../components';
import type { ProfileScreenProps } from '../../../navigation/stacks/ProfileNavigator';
import { AccountSections } from '../components/AccountSections';

/** The Account tab's own settings, kept as a route of its own for anything that still links here (the tab itself now
 * shows the same sections under the profile, D3). There is no Notifications switch: the setting is stored but nothing
 * reads it yet (push notifications are not built), and a switch that changes nothing is a dead control. */
export function SettingsScreen({ navigation }: ProfileScreenProps<'Settings'>) {
  return (
    <ScreenScaffold>
      <AccountSections navigate={route => navigation.navigate(route)} />
    </ScreenScaffold>
  );
}
