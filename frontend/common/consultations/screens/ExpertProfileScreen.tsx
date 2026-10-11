import { MessageSquarePlus, UserX } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Avatar, Button, ScreenState, Skeleton } from '../../components';
import { RatingSummary, ReviewCard } from '../../reviews';
import { CONSULTATIONS_ROUTES } from '../../constants/routes';
import { useExpertProfile } from '../../../expert';
import { useTheme, type Theme } from '../../../theme';
import type { ConsultationsScreenProps } from '../../../navigation/stacks/ConsultationsNavigator';
import { SPECIALIZATION_LABELS } from '../../constants/labels';

export function ExpertProfileScreen({ route, navigation }: ConsultationsScreenProps<'ExpertProfile'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { expertId, prefill } = route.params;
  const query = useExpertProfile(expertId);
  const expert = query.data?.expert;
  const reviews = query.data?.reviews ?? [];

  if (!expert) {
    return (
      <View style={styles.container}>
        <ScreenState
          query={query}
          errorTitle="Couldn't load this expert"
          isEmpty={profile => !profile.expert}
          empty={{ title: 'Expert not found', description: 'This expert may no longer be available.', icon: UserX }}
          skeleton={
            <View style={[styles.content, styles.header]}>
              <Skeleton style={styles.skeletonAvatar} />
              <Skeleton style={styles.skeletonLine} />
              <Skeleton style={styles.skeletonBlock} />
            </View>
          }
        />
      </View>
    );
  }

  const specializations = expert.expert_specializations.map(s => SPECIALIZATION_LABELS[s.specialization]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Avatar name={expert.profile?.full_name} uri={expert.profile?.avatar_url} size={theme.size.avatarLg} />
        <Text style={styles.name}>{expert.profile?.full_name || 'Expert'}</Text>
        {expert.degree ? <Text style={styles.degree}>{expert.degree}</Text> : null}
        <RatingSummary reviews={reviews} />
      </View>

      {specializations.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle} accessibilityRole="header">
            Specializations
          </Text>
          <Text style={styles.sectionText}>{specializations.join(', ')}</Text>
        </View>
      ) : null}

      {expert.qualifications ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle} accessibilityRole="header">
            Qualifications
          </Text>
          <Text style={styles.sectionText}>{expert.qualifications}</Text>
        </View>
      ) : null}

      {expert.experience ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle} accessibilityRole="header">
            Experience
          </Text>
          <Text style={styles.sectionText}>{expert.experience}</Text>
        </View>
      ) : null}

      {expert.professional_description ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle} accessibilityRole="header">
            About
          </Text>
          <Text style={styles.sectionText}>{expert.professional_description}</Text>
        </View>
      ) : null}

      {/* No direct "Message" here: a farmer talks to an expert inside a consultation (SRDS §30, A5). */}
      <Button
        label="Request Consultation"
        icon={MessageSquarePlus}
        onPress={() => navigation.navigate(CONSULTATIONS_ROUTES.RequestConsultation, { expertId, prefill })}
        style={styles.action}
      />
      {reviews.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle} accessibilityRole="header">
            Reviews
          </Text>
          {reviews.map(review => (
            <ReviewCard key={review.id} review={review} />
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

function makeStyles({ colors, space, typography, fontWeight, size, radius }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    content: {
      padding: space[4],
    },
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
    skeletonAvatar: { width: size.avatarLg, height: size.avatarLg, borderRadius: radius.pill },
    skeletonLine: { width: '60%', height: space[5], marginTop: space[3] },
    skeletonBlock: { width: '100%', height: size.photoLg, marginTop: space[4] },
  });
}
