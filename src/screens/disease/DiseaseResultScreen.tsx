import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Badge, Button, Card, EmptyState, Spinner } from '../../components/ui';
import { APP_TABS, MARKETPLACE_ROUTES } from '../../constants/routes';
import { fetchDiseaseCaseWithPrediction } from '../../services/modules/ai/diseaseService';
import { fetchListings } from '../../services/modules/marketplace/listingsService';
import { useTheme, type Theme } from '../../theme';
import { LOW_CONFIDENCE_THRESHOLD } from '../../types/disease';
import type { DiseaseCaseWithPrediction } from '../../types/disease';
import type { ListingWithRelations } from '../../types/marketplace';
import { navigateToConsultExpert } from './expertHandoff';

// Only ever reached by Farmer — Disease Advisory is farmer-only (like Inventory is
// dealer-only), gated at the Quick Actions level (`SellerDashboard.tsx`), so both the
// "Consult an Expert" CTA (needs the requester-side Consultations tab) and the marketplace
// tap-through below can assume a farmer's nav tree.
export function DiseaseResultScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { t } = useTranslation();
  const { diseaseCaseId } = useRoute().params as { diseaseCaseId: string };
  const navigation = useNavigation<any>();
  const [diseaseCase, setDiseaseCase] = useState<DiseaseCaseWithPrediction | null>(null);
  const [relatedListings, setRelatedListings] = useState<ListingWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetchDiseaseCaseWithPrediction(diseaseCaseId).then(async data => {
      if (cancelled) return;
      setDiseaseCase(data);
      setLoading(false);
      if (data.crop?.name) {
        try {
          const listings = await fetchListings({ cropName: data.crop.name });
          if (!cancelled) setRelatedListings(listings.slice(0, 5));
        } catch (err) {
          console.warn('[DiseaseResultScreen] failed to load related listings:', err);
        }
      }
    }).catch(err => {
      console.warn('[DiseaseResultScreen] failed to load disease case:', err);
      if (!cancelled) {
        setError(true);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [diseaseCaseId]);

  useFocusEffect(useCallback(() => load(), [load]));

  if (loading) return <Spinner fullscreen />;
  if (error || !diseaseCase) {
    return (
      <EmptyState
        title={t('disease.result.loadErrorTitle')}
        description={t('common.checkConnectionRetry')}
        actionLabel={t('common.retry')}
        onAction={load}
      />
    );
  }

  const prediction = diseaseCase.prediction;
  const isLowConfidence = (prediction?.confidence_score ?? 0) < LOW_CONFIDENCE_THRESHOLD;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Image source={{ uri: diseaseCase.image_url }} style={styles.image} />

      <Card style={styles.disclaimer}>
        <Text style={styles.disclaimerText}>{t('disease.result.disclaimerText')}</Text>
      </Card>

      {prediction ? (
        <>
          <View style={styles.headerRow}>
            <Text style={styles.disease}>{prediction.predicted_disease}</Text>
            <Badge
              label={`${Math.round(prediction.confidence_score * 100)}% confidence`}
              tone={isLowConfidence ? 'warning' : 'success'}
            />
          </View>

          {prediction.description ? <Text style={styles.description}>{prediction.description}</Text> : null}

          {prediction.recommended_actions.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('disease.result.recommendedActionsTitle')}</Text>
              {prediction.recommended_actions.map((action, index) => (
                <Text key={index} style={styles.bullet}>
                  {'•'} {action}
                </Text>
              ))}
            </View>
          ) : null}
        </>
      ) : (
        <Text style={styles.description}>{t('disease.result.noPredictionFallback')}</Text>
      )}

      <Button
        label={t('disease.result.consultExpertButton')}
        variant={isLowConfidence ? 'primary' : 'secondary'}
        onPress={() =>
          navigateToConsultExpert(navigation, {
            cropId: diseaseCase.crop_id,
            imageUrl: diseaseCase.image_url,
            predictedDisease: prediction?.predicted_disease,
            description: prediction?.description,
          })
        }
        style={styles.action}
      />

      {relatedListings.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('disease.result.relatedProductsTitle')}</Text>
          <Text style={styles.sectionCaption}>{t('disease.result.relatedProductsCaption')}</Text>
          {relatedListings.map(listing => (
            <TouchableOpacity
              key={listing.id}
              onPress={() =>
                navigation
                  .getParent?.()
                  ?.navigate(APP_TABS.Marketplace, {
                    screen: MARKETPLACE_ROUTES.ListingDetail,
                    params: { listingId: listing.id },
                  })
              }
            >
              <Card style={styles.listingCard}>
                <Text style={styles.listingTitle} numberOfLines={1}>
                  {listing.title}
                </Text>
                <Text style={styles.listingPrice}>
                  {t('disease.result.priceFormat', { price: listing.price.toFixed(0), unit: listing.unit })}
                </Text>
              </Card>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

function makeStyles({ colors, spacing, radii, typography }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background.surface,
    },
    content: {
      padding: spacing.lg,
    },
    image: {
      width: '100%',
      height: 220,
      borderRadius: radii.md,
      backgroundColor: colors.border,
      marginBottom: spacing.md,
    },
    disclaimer: {
      backgroundColor: colors.background.default,
      marginBottom: spacing.lg,
    },
    disclaimerText: {
      fontSize: typography.sizes.xs,
      color: colors.text.secondary,
    },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.sm,
    },
    disease: {
      flex: 1,
      marginRight: spacing.sm,
      fontSize: typography.sizes.lg,
      fontWeight: typography.weights.bold as any,
      color: colors.text.primary,
    },
    description: {
      fontSize: typography.sizes.sm,
      color: colors.text.secondary,
      lineHeight: typography.lineHeights.sm,
      marginBottom: spacing.md,
    },
    section: {
      marginBottom: spacing.lg,
    },
    sectionTitle: {
      fontSize: typography.sizes.sm,
      fontWeight: typography.weights.semibold as any,
      color: colors.text.primary,
      marginBottom: spacing.xs,
    },
    sectionCaption: {
      fontSize: typography.sizes.xs,
      color: colors.text.secondary,
      marginBottom: spacing.sm,
    },
    bullet: {
      fontSize: typography.sizes.sm,
      color: colors.text.secondary,
      marginBottom: spacing.xs / 2,
    },
    action: {
      marginBottom: spacing.lg,
    },
    listingCard: {
      marginBottom: spacing.sm,
    },
    listingTitle: {
      fontSize: typography.sizes.sm,
      fontWeight: typography.weights.semibold as any,
      color: colors.text.primary,
    },
    listingPrice: {
      marginTop: spacing.xs / 2,
      fontSize: typography.sizes.xs,
      color: colors.text.secondary,
    },
  });
}
