// Account settings sections: password, two-step verification, theme and delete account.
import { KeyRound, ShieldCheck } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Chip, ListGroup, ListRow } from '../../components';
import { useVerifiedTotpFactor } from '../../auth';
import { PROFILE_ROUTES } from '../../constants/routes';
import { useAuthStore } from '../../../state/authStore';
import { useThemeStore, type ThemeMode } from '../../../state/themeStore';
import { type Theme, useTheme } from '../../../theme';

const THEME_MODES: ThemeMode[] = ['light', 'dark', 'system'];
const THEME_MODE_LABELS: Record<ThemeMode, string> = { light: 'Light', dark: 'Dark', system: 'System' };

type Navigate = (
  route: typeof PROFILE_ROUTES.ChangePassword | typeof PROFILE_ROUTES.MfaEnrollment | typeof PROFILE_ROUTES.DeleteAccount,
) => void;

/** Whether the optional two-step verification is on, as the row's second line. */
function TwoStepRow({ navigate, icon }: { navigate: Navigate; icon: React.ReactNode }) {
  const factor = useVerifiedTotpFactor();
  const meta = factor.isPending ? 'Checking' : factor.isError ? 'Could not check. Open it to try again' : factor.data ? 'On' : 'Off (optional)';
  return <ListRow title="Two-step verification" meta={meta} leading={icon} onPress={() => navigate(PROFILE_ROUTES.MfaEnrollment)} />;
}

/** How the app looks, how the person signs in, and the ways out: the lower half of the Account tab. Sign out is an
 * ordinary secondary button and never red, because signing out is not a loss; deleting the account is a quiet row with a
 * danger-coloured label, last, that leads to its own confirmation.
 * The admin (D19) is the platform's one administrator, set up by the system: only the password changes, there is no
 * two-step verification, and the account cannot be deleted. */
export function AccountSections({ navigate }: { navigate: Navigate }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const isAdmin = useAuthStore(state => state.role === 'admin');
  const signOut = useAuthStore(state => state.signOut);
  const themeMode = useThemeStore(state => state.mode);
  const setThemeMode = useThemeStore(state => state.setMode);
  // Draws a settings icon in the theme's colour and size.
  const icon = (Icon: typeof KeyRound) => <Icon color={theme.colors.ink2} size={theme.size.iconMd} strokeWidth={theme.size.iconStroke} />;

  return (
    <>
      <View style={styles.appearance} accessibilityRole="radiogroup" accessibilityLabel="Appearance">
        <Text style={styles.appearanceLabel}>Appearance</Text>
        {/* The chips wrap, so at 130% text on a narrow phone all three stay on screen. */}
        <View style={styles.chips}>
          {THEME_MODES.map(value => (
            <Chip key={value} label={THEME_MODE_LABELS[value]} selected={themeMode === value} onPress={() => setThemeMode(value)} />
          ))}
        </View>
      </View>

      <ListGroup>
        <ListRow title="Password" meta="Change your password" leading={icon(KeyRound)} onPress={() => navigate(PROFILE_ROUTES.ChangePassword)} />
        {isAdmin ? null : <TwoStepRow navigate={navigate} icon={icon(ShieldCheck)} />}
      </ListGroup>

      <View style={styles.leave}>
        <Button label="Sign out" variant="secondary" onPress={signOut} />
        {isAdmin ? null : <Button label="Delete account" variant="dangerQuiet" onPress={() => navigate(PROFILE_ROUTES.DeleteAccount)} />}
      </View>
    </>
  );
}

// Builds this component's styles from the theme.
function makeStyles({ colors, space, typography, borders, components }: Theme) {
  return StyleSheet.create({
    appearance: {
      gap: space[2],
      padding: components.card.padding,
      backgroundColor: colors.surface,
      borderRadius: components.card.radius,
      borderWidth: borders.hairline,
      borderColor: colors.line,
    },
    appearanceLabel: { ...typography.bodyStrong, color: colors.ink },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
    leave: { gap: space[1] },
  });
}
