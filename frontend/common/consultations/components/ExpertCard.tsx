import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Avatar, Card } from '../../components';
import { useTheme, type Theme } from '../../../theme';
import type { ExpertWithProfile } from '../../../expert';
import { SPECIALIZATION_LABELS } from '../../constants/labels';

export function ExpertCard({ expert, onPress }: { expert: ExpertWithProfile; onPress: () => void }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const specializations = expert.expert_specializations.map(s => SPECIALIZATION_LABELS[s.specialization]);
  const name = expert.profile?.full_name || 'Expert';
  const label = [name, expert.degree, specializations.join(', ')].filter(Boolean).join('. ');

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Opens the expert's profile"
    >
      <Card style={styles.card}>
        <View style={styles.row}>
          <Avatar name={expert.profile?.full_name} uri={expert.profile?.avatar_url} size={theme.size.avatarMd} />
          <View style={styles.textWrap}>
            <Text style={styles.name}>{name}</Text>
            {expert.degree ? <Text style={styles.degree}>{expert.degree}</Text> : null}
            {specializations.length > 0 ? (
              <Text style={styles.specializations} numberOfLines={1}>
                {specializations.join(', ')}
              </Text>
            ) : null}
          </View>
        </View>
      </Card>
    </TouchableOpacity>
  );
}

function makeStyles({ colors, space, size, typography }: Theme) {
  return StyleSheet.create({
    card: {
      marginBottom: space[3],
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: size.touchMin,
    },
    textWrap: {
      flex: 1,
      marginLeft: space[3],
    },
    name: {
      ...typography.bodyStrong,
      color: colors.ink,
    },
    degree: {
      marginTop: space[1] / 2,
      ...typography.caption,
      color: colors.ink2,
    },
    specializations: {
      marginTop: space[1] / 2,
      ...typography.caption,
      // Specialisations are the expert module's content: the expert colour in every shell.
      color: colors.accent.expert.ink,
    },
  });
}
