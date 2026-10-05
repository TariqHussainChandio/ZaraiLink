import { KeyRound, Mail, ShieldCheck } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { ListGroup, ListRow } from '../../components';
import { PROFILE_ROUTES } from '../../constants/routes';
import type { ProfileScreenProps } from '../../../navigation/stacks/ProfileNavigator';
import { useAuthStore } from '../../../state/authStore';
import { useTheme, type Theme } from '../../../theme';

/** An admin's sign-in details in one place (A3b): email, password and the second factor every admin decision needs. */
export function AccountSecurityScreen({ navigation }: ProfileScreenProps<typeof PROFILE_ROUTES.AccountSecurity>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const email = useAuthStore(state => state.user?.email ?? '');
  const icon = (Icon: typeof Mail) => (
    <Icon color={theme.colors.ink2} size={theme.size.iconMd} strokeWidth={theme.size.iconStroke} />
  );
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <ListGroup>
        <ListRow title="Email" meta={email} leading={icon(Mail)} onPress={() => navigation.navigate(PROFILE_ROUTES.ChangeEmail)} />
        <ListRow title="Password" leading={icon(KeyRound)} onPress={() => navigation.navigate(PROFILE_ROUTES.ChangePassword)} />
        <ListRow
          title="Two-step verification"
          meta="Needed for every approval and moderation decision"
          leading={icon(ShieldCheck)}
          onPress={() => navigation.navigate(PROFILE_ROUTES.MfaEnrollment)}
        />
      </ListGroup>
    </ScrollView>
  );
}

function makeStyles({ colors, space }: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.ground },
    content: { padding: space[4] },
  });
}
