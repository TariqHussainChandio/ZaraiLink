import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Avatar, Button, RoleBadge } from '../../components';
import { PROFILE_ROUTES } from '../../constants/routes';
import { useAuthStore } from '../../../state/authStore';
import { useTheme, type Theme } from '../../../theme';
import type { ProfileScreenProps } from '../../../navigation/stacks/ProfileNavigator';

export function ViewProfileScreen({ navigation }: ProfileScreenProps<'ViewProfile'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const profile = useAuthStore(state => state.profile);
  const email = useAuthStore(state => state.user?.email);

  if (!profile) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Avatar name={profile.full_name} uri={profile.avatar_url} size={theme.size.avatarLg} />
        <Text style={styles.name}>{profile.full_name || 'No name yet'}</Text>
        {/* The wrapper takes the header's centring; the badge itself sizes to its label. */}
        <View>
          <RoleBadge role={profile.role} />
        </View>
      </View>

      <View style={styles.section}>
        <Row styles={styles} label="Email" value={email ?? '—'} />
        <Row styles={styles} label="Phone" value={profile.phone ?? '—'} />
        <Row styles={styles} label="Location" value={profile.location ?? '—'} />
      </View>

      <Button
        label="Edit Profile"
        onPress={() => navigation.navigate(PROFILE_ROUTES.EditProfile)}
        style={styles.action}
      />
      <Button
        label="Settings"
        variant="secondary"
        onPress={() => navigation.navigate(PROFILE_ROUTES.Settings)}
        style={styles.action}
      />
    </View>
  );
}

function Row({ label, value, styles }: { label: string; value: string; styles: ReturnType<typeof makeStyles> }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function makeStyles({ colors, space, typography, fontWeight, borders }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.surface,
      padding: space[4],
    },
    header: {
      alignItems: 'center',
      marginBottom: space[6],
      gap: space[2],
    },
    name: {
      ...typography.titleLg,
      color: colors.ink,
    },
    section: {
      marginBottom: space[6],
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: space[2],
      borderBottomWidth: borders.hairline,
      borderBottomColor: colors.line,
    },
    rowLabel: {
      ...typography.body,
      color: colors.ink2,
    },
    rowValue: {
      ...typography.body,
      color: colors.ink,
      fontWeight: fontWeight.medium,
    },
    action: {
      marginBottom: space[3],
    },
  });
}
