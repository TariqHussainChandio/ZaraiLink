import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Avatar, Card } from '../../ui';
import { useTheme, type Theme } from '../../../theme';
import type { ExpertWithProfile } from '../../../types/expert';
import { SPECIALIZATION_LABELS } from '../../../constants/labels';

export function ExpertCard({ expert, onPress }: { expert: ExpertWithProfile; onPress: () => void }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const specializations = expert.expert_specializations.map(s => SPECIALIZATION_LABELS[s.specialization]);

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
      <Card style={styles.card}>
        <View style={styles.row}>
          <Avatar name={expert.profile?.full_name} uri={expert.profile?.avatar_url} size={44} />
          <View style={styles.textWrap}>
            <Text style={styles.name}>{expert.profile?.full_name ?? 'Expert'}</Text>
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

function makeStyles({ colors, spacing, typography }: Theme) {
  return StyleSheet.create({
    card: {
      marginBottom: spacing.md,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    textWrap: {
      flex: 1,
      marginLeft: spacing.md,
    },
    name: {
      fontSize: typography.sizes.base,
      fontWeight: typography.weights.semibold,
      color: colors.text.primary,
    },
    degree: {
      marginTop: spacing.xs / 2,
      fontSize: typography.sizes.sm,
      color: colors.text.secondary,
    },
    specializations: {
      marginTop: spacing.xs / 2,
      fontSize: typography.sizes.xs,
      color: colors.brand.primary,
    },
  });
}
