import { Building2, Home, Mail, MapPin, Phone, UserX } from 'lucide-react-native';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Avatar, Button, EmptyState, ListGroup, ListRow, RoleBadge, ScreenScaffold } from '../../components';
import { PROFILE_ROUTES } from '../../constants/routes';
import { useAuthStore } from '../../../state/authStore';
import { useTheme, type Theme } from '../../../theme';
import type { ProfileScreenProps } from '../../../navigation/stacks/ProfileNavigator';
import { AccountSections } from '../components/AccountSections';

/** The Account tab (D3): who you are, what is on your profile, how the app looks and how you sign in, in one scrolling
 * list. A value that is missing is an invitation ("Add phone number") that opens the form, not a dash. */
export function ViewProfileScreen({ navigation }: ProfileScreenProps<'ViewProfile'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const profile = useAuthStore(state => state.profile);
  const email = useAuthStore(state => state.user?.email);
  const refreshProfile = useAuthStore(state => state.refreshProfile);
  const [retrying, setRetrying] = useState(false);

  // The profile is loaded with the session; if it is missing the Account tab says so and offers to load it again, instead
  // of showing an empty screen with no way to sign out.
  if (!profile) {
    return (
      <ScreenScaffold>
        <EmptyState
          icon={UserX}
          title="Couldn't load your profile"
          description="Check your connection, then try again."
          actionLabel={retrying ? 'Trying again' : 'Try again'}
          onAction={() => {
            if (retrying) return;
            setRetrying(true);
            refreshProfile()
              .catch(() => undefined)
              .finally(() => setRetrying(false));
          }}
        />
        <AccountSections navigate={route => navigation.navigate(route)} />
      </ScreenScaffold>
    );
  }

  // The structured place from sign-up and Edit profile (A3b); the old free-text field only when none is set.
  const place = [profile.village, profile.city, profile.province, profile.country].filter(Boolean).join(', ') || profile.location;
  // Stored as +923001234567, read as 0300 1234567: the way the person writes it.
  const phone = profile.phone ? (parsePhoneNumberFromString(profile.phone)?.formatNational() ?? profile.phone) : null;
  const edit = () => navigation.navigate(PROFILE_ROUTES.EditProfile);
  const icon = (Icon: typeof Mail) => <Icon color={theme.colors.ink2} size={theme.size.iconMd} strokeWidth={theme.size.iconStroke} />;

  return (
    <ScreenScaffold>
      <View style={styles.header}>
        <Avatar name={profile.full_name} uri={profile.avatar_url} role={profile.role} size={theme.size.avatarLg} ring />
        <View style={styles.who}>
          <Text style={styles.name}>{profile.full_name || 'Add your name'}</Text>
          <View style={styles.badge}>
            <RoleBadge role={profile.role} />
          </View>
          <Button label="Edit profile" variant="quiet" size="sm" fullWidth={false} onPress={edit} />
        </View>
      </View>

      <ListGroup>
        <ListRow title="Email" meta={email ?? 'Not available'} leading={icon(Mail)} />
        <ListRow title="Phone" meta={phone ?? 'Add phone number'} leading={icon(Phone)} onPress={edit} />
        <ListRow title="Place" meta={place || 'Add your location'} leading={icon(MapPin)} onPress={edit} />
        <ListRow title="Address" meta={profile.street ?? 'Add your address'} leading={icon(Home)} onPress={edit} />
        {profile.role === 'dealer' ? (
          <ListRow
            title="Business details"
            leading={icon(Building2)}
            onPress={() => navigation.navigate(PROFILE_ROUTES.BusinessDetails)}
          />
        ) : null}
      </ListGroup>

      <AccountSections navigate={route => navigation.navigate(route)} />
    </ScreenScaffold>
  );
}

function makeStyles({ colors, space, typography }: Theme) {
  return StyleSheet.create({
    header: { flexDirection: 'row', alignItems: 'center', gap: space[4] },
    who: { flex: 1, gap: space[1], alignItems: 'flex-start' },
    name: { ...typography.titleLg, color: colors.ink },
    badge: { alignSelf: 'flex-start' },
  });
}
