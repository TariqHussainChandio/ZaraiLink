import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Avatar, Button, EmptyState, Spinner } from '../../components/ui';
import { RatingSummary } from '../../components/features/reviews/RatingSummary';
import { ReviewCard } from '../../components/features/reviews/ReviewCard';
import { APP_TABS, CONSULTATIONS_ROUTES, MESSAGING_ROUTES } from '../../constants/routes';
import { fetchExpertById } from '../../services/modules/expert/expertService';
import { findOrCreateConversation } from '../../services/modules/messaging/messagingService';
import { fetchReviewsForExpert } from '../../services/modules/reviews/reviewsService';
import { useAuthStore } from '../../store/authStore';
import { useAppTabNavigation } from '../../navigation/stacks/useAppTabNavigation';
import { useTheme, type Theme } from '../../theme';
import type { ExpertWithProfile } from '../../types/expert';
import type { ReviewWithBuyer } from '../../types/reviews';
import type { ConsultationsScreenProps } from '../../navigation/stacks/ConsultationsNavigator';

// Maps each specialization id to its translation key suffix under `expert.specializations` —
// shared verbatim with ExpertApplicationScreen's own copy of this map.
const SPECIALIZATION_KEY_MAP: Record<string, string> = {
  crop_management: 'cropManagement',
  plant_diseases: 'plantDiseases',
  pest_management: 'pestManagement',
  fertilizer_management: 'fertilizerManagement',
  irrigation: 'irrigation',
  soil_management: 'soilManagement',
  crop_nutrition: 'cropNutrition',
  general_agriculture: 'generalAgriculture',
};

export function ExpertProfileScreen({ route, navigation }: ConsultationsScreenProps<'ExpertProfile'>) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { expertId, prefill } = route.params;
  const userId = useAuthStore(state => state.user?.id);
  const tabNavigation = useAppTabNavigation();
  const [expert, setExpert] = useState<ExpertWithProfile | null>(null);
  const [reviews, setReviews] = useState<ReviewWithBuyer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [messaging, setMessaging] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    Promise.all([fetchExpertById(expertId), fetchReviewsForExpert(expertId)])
      .then(([expertData, reviewsData]) => {
        setExpert(expertData);
        setReviews(reviewsData);
      })
      .catch(err => {
        console.warn('[ExpertProfileScreen] failed to load expert profile:', err);
        setError(true);
      })
      .finally(() => setLoading(false));
  }, [expertId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <Spinner fullscreen />;
  if (error || !expert) {
    return (
      <EmptyState
        title={t('expert.expertProfile.errorTitle')}
        description={t('expert.expertProfile.errorDescription')}
        actionLabel={t('common.retry')}
        onAction={load}
      />
    );
  }

  const specializations = expert.expert_specializations.map(s => {
    const key = SPECIALIZATION_KEY_MAP[s.specialization];
    return key ? t(`expert.specializations.${key}`) : s.specialization;
  });

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Avatar name={expert.profile?.full_name} uri={expert.profile?.avatar_url} size={72} />
        <Text style={styles.name}>{expert.profile?.full_name ?? t('expert.expertProfile.defaultName')}</Text>
        {expert.degree ? <Text style={styles.degree}>{expert.degree}</Text> : null}
        <RatingSummary reviews={reviews} />
      </View>

      {specializations.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('expert.expertProfile.specializationsTitle')}</Text>
          <Text style={styles.sectionText}>{specializations.join(', ')}</Text>
        </View>
      ) : null}

      {expert.qualifications ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('expert.expertProfile.qualificationsTitle')}</Text>
          <Text style={styles.sectionText}>{expert.qualifications}</Text>
        </View>
      ) : null}

      {expert.experience ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('expert.expertProfile.experienceTitle')}</Text>
          <Text style={styles.sectionText}>{expert.experience}</Text>
        </View>
      ) : null}

      {expert.professional_description ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('expert.expertProfile.aboutTitle')}</Text>
          <Text style={styles.sectionText}>{expert.professional_description}</Text>
        </View>
      ) : null}

      <Button
        label={t('expert.expertProfile.requestConsultation')}
        onPress={() => navigation.navigate(CONSULTATIONS_ROUTES.RequestConsultation, { expertId, prefill })}
        style={styles.action}
      />
      <Button
        label={t('expert.expertProfile.messageExpert')}
        variant="secondary"
        loading={messaging}
        onPress={async () => {
          if (!userId) return;
          setMessaging(true);
          try {
            const conversation = await findOrCreateConversation(expertId);
            tabNavigation?.navigate(APP_TABS.Messages, {
              screen: MESSAGING_ROUTES.Chat,
              params: {
                conversationId: conversation.id,
                otherUserName: expert.profile?.full_name ?? t('expert.expertProfile.defaultName'),
              },
            });
          } finally {
            setMessaging(false);
          }
        }}
        style={styles.action}
      />

      {reviews.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('expert.expertProfile.reviewsTitle')}</Text>
          {reviews.map(review => (
            <ReviewCard key={review.id} review={review} />
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

function makeStyles({ colors, spacing, typography }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background.surface,
    },
    content: {
      padding: spacing.lg,
    },
    header: {
      alignItems: 'center',
      marginBottom: spacing.lg,
    },
    name: {
      marginTop: spacing.sm,
      fontSize: typography.sizes.xl,
      fontWeight: typography.weights.bold as any,
      color: colors.text.primary,
    },
    degree: {
      marginTop: spacing.xs / 2,
      fontSize: typography.sizes.sm,
      color: colors.text.secondary,
    },
    section: {
      marginBottom: spacing.lg,
    },
    sectionTitle: {
      fontSize: typography.sizes.sm,
      fontWeight: typography.weights.semibold as any,
      color: colors.text.secondary,
      marginBottom: spacing.xs,
    },
    sectionText: {
      fontSize: typography.sizes.base,
      color: colors.text.primary,
      lineHeight: typography.lineHeights.base,
    },
    action: {
      marginBottom: spacing.md,
    },
  });
}
