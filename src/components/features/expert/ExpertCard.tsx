import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Avatar, Card } from '../../ui';
import { lightTheme } from '../../../theme';
import type { ExpertWithProfile } from '../../../types/expert';

const { colors, spacing, typography } = lightTheme;

const SPECIALIZATION_LABEL: Record<string, string> = {
  crop_management: 'Crop Management',
  plant_diseases: 'Plant Diseases',
  pest_management: 'Pest Management',
  fertilizer_management: 'Fertilizer Management',
  irrigation: 'Irrigation',
  soil_management: 'Soil Management',
  crop_nutrition: 'Crop Nutrition',
  general_agriculture: 'General Agriculture',
};

export function ExpertCard({ expert, onPress }: { expert: ExpertWithProfile; onPress: () => void }) {
  const specializations = expert.expert_specializations.map(s => SPECIALIZATION_LABEL[s.specialization] ?? s.specialization);

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

const styles = StyleSheet.create({
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
    fontWeight: typography.weights.semibold as any,
    color: colors.neutral.gray900,
  },
  degree: {
    marginTop: spacing.xs / 2,
    fontSize: typography.sizes.sm,
    color: colors.neutral.gray600,
  },
  specializations: {
    marginTop: spacing.xs / 2,
    fontSize: typography.sizes.xs,
    color: colors.brand.primary,
  },
});
