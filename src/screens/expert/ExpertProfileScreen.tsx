import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Avatar, Button, Spinner } from '../../components/ui';
import { RatingSummary } from '../../components/features/reviews/RatingSummary';
import { ReviewCard } from '../../components/features/reviews/ReviewCard';
import { APP_TABS, CONSULTATIONS_ROUTES, MESSAGING_ROUTES } from '../../constants/routes';
import { fetchExpertById } from '../../services/modules/expert/expertService';
import { findOrCreateConversation } from '../../services/modules/messaging/messagingService';
import { fetchReviewsForExpert } from '../../services/modules/reviews/reviewsService';
import { useAuthStore } from '../../store/authStore';
import { useAppTabNavigation } from '../../navigation/stacks/useAppTabNavigation';
import { lightTheme } from '../../theme';
import type { ExpertWithProfile } from '../../types/expert';
import type { ReviewWithBuyer } from '../../types/reviews';
import type { ConsultationsScreenProps } from '../../navigation/stacks/ConsultationsNavigator';

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

export function ExpertProfileScreen({ route, navigation }: ConsultationsScreenProps<'ExpertProfile'>) {
  const { expertId, prefill } = route.params;
  const userId = useAuthStore(state => state.user?.id);
  const tabNavigation = useAppTabNavigation();
  const [expert, setExpert] = useState<ExpertWithProfile | null>(null);
  const [reviews, setReviews] = useState<ReviewWithBuyer[]>([]);
  const [loading, setLoading] = useState(true);
  const [messaging, setMessaging] = useState(false);

  useEffect(() => {
    Promise.all([fetchExpertById(expertId), fetchReviewsForExpert(expertId)])
      .then(([expertData, reviewsData]) => {
        setExpert(expertData);
        setReviews(reviewsData);
      })
      .catch(err => {
        console.warn('[ExpertProfileScreen] failed to load expert profile:', err);
      })
      .finally(() => setLoading(false));
  }, [expertId]);

  if (loading || !expert) return <Spinner fullscreen />;

  const specializations = expert.expert_specializations.map(
    s => SPECIALIZATION_LABEL[s.specialization] ?? s.specialization,
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Avatar name={expert.profile?.full_name} uri={expert.profile?.avatar_url} size={72} />
        <Text style={styles.name}>{expert.profile?.full_name ?? 'Expert'}</Text>
        {expert.degree ? <Text style={styles.degree}>{expert.degree}</Text> : null}
        <RatingSummary reviews={reviews} />
      </View>

      {specializations.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Specializations</Text>
          <Text style={styles.sectionText}>{specializations.join(', ')}</Text>
        </View>
      ) : null}

      {expert.qualifications ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Qualifications</Text>
          <Text style={styles.sectionText}>{expert.qualifications}</Text>
        </View>
      ) : null}

      {expert.experience ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Experience</Text>
          <Text style={styles.sectionText}>{expert.experience}</Text>
        </View>
      ) : null}

      {expert.professional_description ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <Text style={styles.sectionText}>{expert.professional_description}</Text>
        </View>
      ) : null}

      <Button
        label="Request Consultation"
        onPress={() => navigation.navigate(CONSULTATIONS_ROUTES.RequestConsultation, { expertId, prefill })}
        style={styles.action}
      />
      <Button
        label="Message Expert"
        variant="secondary"
        loading={messaging}
        onPress={async () => {
          if (!userId) return;
          setMessaging(true);
          try {
            const conversation = await findOrCreateConversation(expertId);
            tabNavigation?.navigate(APP_TABS.Messages, {
              screen: MESSAGING_ROUTES.Chat,
              params: { conversationId: conversation.id, otherUserName: expert.profile?.full_name ?? 'Expert' },
            });
          } finally {
            setMessaging(false);
          }
        }}
        style={styles.action}
      />

      {reviews.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Reviews</Text>
          {reviews.map(review => (
            <ReviewCard key={review.id} review={review} />
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.neutral.white,
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
    color: colors.neutral.gray900,
  },
  degree: {
    marginTop: spacing.xs / 2,
    fontSize: typography.sizes.sm,
    color: colors.neutral.gray600,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold as any,
    color: colors.neutral.gray600,
    marginBottom: spacing.xs,
  },
  sectionText: {
    fontSize: typography.sizes.base,
    color: colors.neutral.gray900,
    lineHeight: typography.lineHeights.base,
  },
  action: {
    marginBottom: spacing.md,
  },
});
