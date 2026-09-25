import React, { useMemo } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Avatar, Button, EmptyState, Spinner } from '../../components/ui';
import { RatingSummary } from '../../components/features/reviews/RatingSummary';
import { ReviewCard } from '../../components/features/reviews/ReviewCard';
import { APP_TABS, CONSULTATIONS_ROUTES, MESSAGING_ROUTES } from '../../constants/routes';
import { useExpertProfile } from '../../hooks/api/experts';
import { useOpenConversation } from '../../hooks/api/messaging';
import { useAuthStore } from '../../store/authStore';
import { useAppTabNavigation } from '../../navigation/stacks/useAppTabNavigation';
import { useTheme, type Theme } from '../../theme';
import { errorMessage } from '../../utils/errorMessage';
import type { ConsultationsScreenProps } from '../../navigation/stacks/ConsultationsNavigator';
import { SPECIALIZATION_LABELS } from '../../constants/labels';

export function ExpertProfileScreen({ route, navigation }: ConsultationsScreenProps<'ExpertProfile'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { expertId, prefill } = route.params;
  const userId = useAuthStore(state => state.user?.id);
  const tabNavigation = useAppTabNavigation();
  const { data, isPending: loading, error, refetch } = useExpertProfile(expertId);
  const openConversation = useOpenConversation();
  const expert = data?.expert;
  const reviews = data?.reviews ?? [];
  const load = () => refetch();

  if (loading) return <Spinner fullscreen />;
  if (error || !expert) {
    return (
      <EmptyState
        title="Couldn't load this expert"
        description="Check your connection and try again."
        actionLabel="Retry"
        onAction={load}
      />
    );
  }

  const specializations = expert.expert_specializations.map(s => SPECIALIZATION_LABELS[s.specialization]);

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
        loading={openConversation.isPending}
        onPress={async () => {
          if (!userId) return;
          try {
            const conversation = await openConversation.mutateAsync(expertId);
            tabNavigation?.navigate(APP_TABS.Messages, {
              screen: MESSAGING_ROUTES.Chat,
              params: {
                conversationId: conversation.id,
                otherUserName: expert.profile?.full_name ?? 'Expert',
              },
            });
          } catch (err) {
            Alert.alert('Could not open the conversation', errorMessage(err));
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
      fontWeight: typography.weights.bold,
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
      fontWeight: typography.weights.semibold,
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
