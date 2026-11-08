import React, { useMemo } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Avatar, Button, QueryState, ScreenScaffold } from '../../components';
import { RatingSummary, ReviewCard } from '../../reviews';
import { APP_TABS, CONSULTATIONS_ROUTES, MESSAGING_ROUTES } from '../../constants/routes';
import { useExpertProfile } from '../../../expert';
import { useOpenConversation } from '../../messaging';
import { useAuthStore } from '../../../state/authStore';
import { navigateInTab } from '../../../navigation/navigateInTab';
import { useAppTabNavigation } from '../../../navigation/stacks/useAppTabNavigation';
import { useTheme, type Theme } from '../../../theme';
import { errorMessage } from '../../../utils/errorMessage';
import type { ConsultationsScreenProps } from '../../../navigation/stacks/ConsultationsNavigator';
import { SPECIALIZATION_LABELS } from '../../constants/labels';

export function ExpertProfileScreen({ route, navigation }: ConsultationsScreenProps<'ExpertProfile'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { expertId, prefill } = route.params;
  const userId = useAuthStore(state => state.user?.id);
  const tabNavigation = useAppTabNavigation();
  const query = useExpertProfile(expertId);
  const { data } = query;
  const openConversation = useOpenConversation();
  const expert = data?.expert;
  const reviews = data?.reviews ?? [];

  const specializations = expert?.expert_specializations.map(s => SPECIALIZATION_LABELS[s.specialization]) ?? [];

  return (
    <ScreenScaffold>
      <QueryState query={query} failureTitle="Couldn't load this expert">
        {expert ? (
          <>
            <View style={styles.header}>
              <Avatar name={expert.profile?.full_name} uri={expert.profile?.avatar_url} size={theme.size.avatarLg} />
              <Text style={styles.name}>{expert.profile?.full_name || 'Expert'}</Text>
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
              label="Ask an expert"
              onPress={() =>
                navigation.navigate(CONSULTATIONS_ROUTES.RequestConsultation, {
                  expertId,
                  prefill,
                })
              }
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
                  // On top of the conversation list, so Back and the Messages tab reach it, not a stack whose root is this chat.
                  navigateInTab(tabNavigation, APP_TABS.Messages, MESSAGING_ROUTES.Chat, {
                    conversationId: conversation.id,
                    otherUserName: expert.profile?.full_name || 'Expert',
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
          </>
        ) : null}
      </QueryState>
    </ScreenScaffold>
  );
}

function makeStyles({ colors, space, typography, fontWeight }: Theme) {
  return StyleSheet.create({
    header: {
      alignItems: 'center',
      marginBottom: space[4],
    },
    name: {
      marginTop: space[2],
      ...typography.titleLg,
      color: colors.ink,
    },
    degree: {
      marginTop: space[1] / 2,
      ...typography.caption,
      color: colors.ink2,
    },
    section: {
      marginBottom: space[4],
    },
    sectionTitle: {
      ...typography.caption,
      fontWeight: fontWeight.semibold,
      color: colors.ink2,
      marginBottom: space[1],
    },
    sectionText: {
      ...typography.body,
      color: colors.ink,
    },
    action: {
      marginBottom: space[3],
    },
  });
}
