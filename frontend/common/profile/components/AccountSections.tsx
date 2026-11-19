import { KeyRound, ShieldCheck } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Chip, ListGroup, ListRow } from '../../components';
import { PROFILE_ROUTES } from '../../constants/routes';
import { useAuthStore } from '../../../state/authStore';
import { useThemeStore, type ThemeMode } from '../../../state/themeStore';
import { type Theme, useTheme } from '../../../theme';

const THEME_MODES: ThemeMode[] = ['light', 'dark', 'system'];
const THEME_MODE_LABELS: Record<ThemeMode, string> = { light: 'Light', dark: 'Dark', system: 'System' };

type Navigate = (route: typeof PROFILE_ROUTES.ChangePassword | typeof PROFILE_ROUTES.AccountSecurity | typeof PROFILE_ROUTES.DeleteAccount) => void;

/** How the app looks, how the person signs in, and the two ways out: the lower half of the Account tab. Sign out is an
 * ordinary secondary button and never red, because signing out is not a loss; deleting the account is a quiet row with a
 * danger-coloured label, last, that leads to its own confirmation. */
export function AccountSections({ navigate }: { navigate: Navigate }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const role = useAuthStore(state => state.role);
  const signOut = useAuthStore(state => state.signOut);
  const themeMode = useThemeStore(state => state.mode);
  const setThemeMode = useThemeStore(state => state.setMode);
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
        {/* An admin keeps email, password and the second factor (every admin write needs aal2) in Account security
            (A3b); everyone else changes the password directly. */}
        {role === 'admin' ? (
          <ListRow
            title="Account security"
            meta="Email, password and two-step verification"
            leading={icon(ShieldCheck)}
            onPress={() => navigate(PROFILE_ROUTES.AccountSecurity)}
          />
        ) : (
          <ListRow title="Password" meta="Change your password" leading={icon(KeyRound)} onPress={() => navigate(PROFILE_ROUTES.ChangePassword)} />
        )}
      </ListGroup>

      <View style={styles.leave}>
        <Button label="Sign out" variant="secondary" onPress={signOut} />
        <Button label="Delete account" variant="dangerQuiet" onPress={() => navigate(PROFILE_ROUTES.DeleteAccount)} />
      </View>
    </>
  );
}

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
