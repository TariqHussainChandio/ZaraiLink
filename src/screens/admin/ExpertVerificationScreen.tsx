import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Linking, StyleSheet, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Badge, Button, EmptyState, FilterChips, Input, Spinner } from '../../components/ui';
import { useExpertDocumentUrl, useExpertVerifications, useReviewVerification } from '../../hooks/api/admin';
import { useAuthStore } from '../../store/authStore';
import { useTheme, type Theme } from '../../theme';
import type { VerificationStatus } from '../../types/expert';
import { errorMessage } from '../../utils/errorMessage';

type FilterValue = VerificationStatus | 'all';

const STATUS_TONE: Record<VerificationStatus, 'warning' | 'success' | 'error' | 'neutral'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'error',
  suspended: 'error',
};

export function ExpertVerificationScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const filters: { value: FilterValue; label: string }[] = useMemo(
    () => [
      { value: 'pending', label: 'Pending' },
      { value: 'approved', label: 'Approved' },
      { value: 'rejected', label: 'Rejected' },
      { value: 'suspended', label: 'Suspended' },
      { value: 'all', label: 'All' },
    ],
    [],
  );
  const actorId = useAuthStore(state => state.user?.id);
  const [filter, setFilter] = useState<FilterValue>('pending');
  const { data: experts = [], isPending: loading, refetch } = useExpertVerifications(filter === 'all' ? undefined : filter);
  const review = useReviewVerification();
  const documentUrl = useExpertDocumentUrl();
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  const decide = async (expert: (typeof experts)[number], decision: VerificationStatus) => {
    if (!actorId) return;
    const latestVerification = expert.expert_verifications[0];
    if (!latestVerification) return;
    setUpdatingId(expert.id);
    try {
      await review.mutateAsync({
        expertId: expert.id,
        verificationId: latestVerification.id,
        decision,
        notes: notes[expert.id] ?? '',
      });
    } catch (error) {
      Alert.alert('Could not record the decision', errorMessage(error));
    } finally {
      setUpdatingId(null);
    }
  };

  const viewDocument = async (expertId: string) => {
    try {
      const url = await documentUrl.mutateAsync(expertId);
      if (url) Linking.openURL(url);
    } catch (error) {
      Alert.alert('Could not open the document', errorMessage(error));
    }
  };

  if (loading) return <Spinner fullscreen />;

  return (
    <View style={styles.container}>
      <FilterChips options={filters} value={filter} onChange={setFilter} />
      <FlashList
        contentContainerStyle={styles.list}
        data={experts}
        keyExtractor={item => item.id}
        ListEmptyComponent={<EmptyState title="No experts in this status" />}
        renderItem={({ item }) => {
          const latestVerification = item.expert_verifications[0];
          return (
            <View style={styles.card}>
              <View style={styles.headerRow}>
                <Text style={styles.name}>{item.profile?.full_name ?? 'Unknown'}</Text>
                <Badge label={item.verification_status} tone={STATUS_TONE[item.verification_status]} />
              </View>
              <Text style={styles.detail}>{item.degree ?? 'No degree listed'}</Text>
              <Text style={styles.detail}>{item.experience ?? 'No experience listed'}</Text>
              {item.qualifications ? <Text style={styles.detail}>{item.qualifications}</Text> : null}
              <View style={styles.badgeRow}>
                {item.expert_specializations.map(s => (
                  <Badge key={s.specialization} label={s.specialization.replace(/_/g, ' ')} tone="info" />
                ))}
              </View>

              {latestVerification?.document_url ? (
                <Button
                  label="View Document"
                  variant="ghost"
                  fullWidth={false}
                  style={styles.docButton}
                  onPress={() => viewDocument(item.id)}
                />
              ) : null}

              <Input
                placeholder="Decision note (optional)"
                value={notes[item.id] ?? ''}
                onChangeText={text => setNotes(prev => ({ ...prev, [item.id]: text }))}
              />

              <View style={styles.actions}>
                {item.verification_status === 'pending' ? (
                  <>
                    <Button
                      label="Approve"
                      fullWidth={false}
                      loading={updatingId === item.id}
                      onPress={() => decide(item, 'approved')}
                    />
                    <Button
                      label="Reject"
                      variant="destructive"
                      fullWidth={false}
                      loading={updatingId === item.id}
                      onPress={() => decide(item, 'rejected')}
                    />
                  </>
                ) : item.verification_status === 'approved' ? (
                  <Button
                    label="Suspend"
                    variant="destructive"
                    fullWidth={false}
                    loading={updatingId === item.id}
                    onPress={() => decide(item, 'suspended')}
                  />
                ) : item.verification_status === 'suspended' ? (
                  <Button
                    label="Reactivate"
                    variant="secondary"
                    fullWidth={false}
                    loading={updatingId === item.id}
                    onPress={() => decide(item, 'approved')}
                  />
                ) : null}
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

function makeStyles({ colors, spacing, radii, typography }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background.surface,
      paddingTop: spacing.md,
    },
    list: {
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.lg,
    },
    card: {
      backgroundColor: colors.background.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.lg,
      padding: spacing.md,
      marginBottom: spacing.md,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.xs,
    },
    name: {
      fontSize: typography.sizes.base,
      fontWeight: typography.weights.semibold,
      color: colors.text.primary,
    },
    detail: {
      fontSize: typography.sizes.sm,
      color: colors.text.secondary,
      marginTop: spacing.xs / 2,
    },
    badgeRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.xs,
      marginTop: spacing.sm,
    },
    docButton: {
      marginTop: spacing.sm,
      alignSelf: 'flex-start',
    },
    actions: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginTop: spacing.xs,
    },
  });
}
