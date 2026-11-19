import { KeyRound, Mail, ShieldCheck } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { ListGroup, ListRow, ScreenScaffold } from '../../components';
import { useVerifiedTotpFactor } from '../../auth';
import { PROFILE_ROUTES } from '../../constants/routes';
import type { ProfileScreenProps } from '../../../navigation/stacks/ProfileNavigator';
import { useAuthStore } from '../../../state/authStore';
import { useTheme } from '../../../theme';

/** An admin's sign-in details in one place (A3b): email, password and the second factor every admin decision needs. */
export function AccountSecurityScreen({ navigation }: ProfileScreenProps<typeof PROFILE_ROUTES.AccountSecurity>) {
  const theme = useTheme();
  const email = useAuthStore(state => state.user?.email ?? '');
  const factor = useVerifiedTotpFactor();
  const icon = (Icon: typeof Mail) => (
    <Icon color={theme.colors.ink2} size={theme.size.iconMd} strokeWidth={theme.size.iconStroke} />
  );
  // Whether it is on is the first thing an admin wants to know here, and it decides whether any approval works.
  const twoStepMeta = useMemo(() => {
    if (factor.isPending) return 'Checking';
    if (factor.isError) return 'Could not check. Open it to try again';
    return factor.data ? 'On. Needed for every approval and moderation decision' : 'Off. Turn it on to approve and moderate';
  }, [factor.isPending, factor.isError, factor.data]);
  return (
    <ScreenScaffold>
      <ListGroup>
        <ListRow title="Email" meta={email} leading={icon(Mail)} onPress={() => navigation.navigate(PROFILE_ROUTES.ChangeEmail)} />
        <ListRow title="Password" leading={icon(KeyRound)} onPress={() => navigation.navigate(PROFILE_ROUTES.ChangePassword)} />
        <ListRow
          title="Two-step verification"
          meta={twoStepMeta}
          leading={icon(ShieldCheck)}
          onPress={() => navigation.navigate(PROFILE_ROUTES.MfaEnrollment)}
        />
      </ListGroup>
    </ScreenScaffold>
  );
}
