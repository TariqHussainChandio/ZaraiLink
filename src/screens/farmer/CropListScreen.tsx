import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Card, EmptyState, Spinner } from '../../components/ui';
import { HOME_ROUTES } from '../../constants/routes';
import { fetchFarmCrops } from '../../services/modules/farmer/farmService';
import { useTheme, type Theme } from '../../theme';
import type { FarmCropWithCrop } from '../../types/farmer';
import type { HomeScreenProps } from '../../navigation/stacks/HomeNavigator';

export function CropListScreen({ route, navigation }: HomeScreenProps<'CropList'>) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { farmId } = route.params;
  const [crops, setCrops] = useState<FarmCropWithCrop[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetchFarmCrops(farmId).then(data => {
      if (!cancelled) {
        setCrops(data);
        setLoading(false);
      }
    }).catch(err => {
      console.warn('[CropListScreen] failed to load crops:', err);
      if (!cancelled) {
        setError(true);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [farmId]);

  useFocusEffect(useCallback(() => load(), [load]));

  if (loading) return <Spinner fullscreen />;
  if (error) {
    return (
      <EmptyState
        title={t('farmer.cropList.loadErrorTitle', "Couldn't load crops")}
        description={t('farmer.cropList.loadErrorDescription', 'Check your connection and try again.')}
        actionLabel={t('common.retry')}
        onAction={load}
      />
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={crops}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => navigation.navigate(HOME_ROUTES.AddCrop, { farmId, cropId: item.id })}
          >
            <Card style={styles.card}>
              <Text style={styles.name}>
                {item.crop?.name ?? t('farmer.cropList.unspecifiedCrop', 'Unspecified crop')}
              </Text>
              <Text style={styles.meta}>
                {[item.variety, item.growth_stage].filter(Boolean).join(' · ') ||
                  t('farmer.cropList.noDetailsYet', 'No details yet')}
              </Text>
              {item.planting_date ? (
                <Text style={styles.meta}>
                  {t('farmer.cropList.plantedLabel', 'Planted {{date}}', { date: item.planting_date })}
                </Text>
              ) : null}
            </Card>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <EmptyState
            title={t('farmer.cropList.emptyCropsTitle', 'No crops recorded')}
            description={t('farmer.cropList.emptyCropsDescription', 'Add the crops growing on this farm.')}
          />
        }
      />
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate(HOME_ROUTES.AddCrop, { farmId })}
      >
        <Text style={styles.fabLabel}>{t('farmer.cropList.addCropFab', '+ Add Crop')}</Text>
      </TouchableOpacity>
    </View>
  );
}

function makeStyles({ colors, spacing, radii, typography, shadows }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background.surface,
    },
    list: {
      padding: spacing.lg,
      paddingBottom: spacing['3xl'],
    },
    card: {
      marginBottom: spacing.md,
    },
    name: {
      fontSize: typography.sizes.base,
      fontWeight: typography.weights.semibold as any,
      color: colors.text.primary,
    },
    meta: {
      marginTop: spacing.xs / 2,
      fontSize: typography.sizes.sm,
      color: colors.text.secondary,
    },
    fab: {
      position: 'absolute',
      right: spacing.lg,
      bottom: spacing.lg,
      backgroundColor: colors.brand.primary,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderRadius: radii.full,
      ...shadows.md,
    },
    fabLabel: {
      color: colors.neutral.white,
      fontWeight: '700',
    },
  });
}
