import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Linking, StyleSheet, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Badge, Button, ChipRow, EmptyState, Spinner, StatusBadge, TextField } from '../../common/components';
import { useExpertDocumentUrl, useExpertVerifications, useReviewVerification } from '../hooks/admin';
import { useAuthStore } from '../../state/authStore';
import { useTheme, type Theme } from '../../theme';
import type { VerificationStatus } from '../../expert';
import { errorMessage } from '../../utils/errorMessage';

type FilterValue = VerificationStatus | 'all';

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
      <ChipRow options={filters} value={filter} onChange={setFilter} />
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
                <Text style={styles.name}>{item.profile?.full_name || 'Unknown'}</Text>
                <StatusBadge kind="application" status={item.verification_status} />
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
                  variant="quiet"
                  fullWidth={false}
                  style={styles.docButton}
                  onPress={() => viewDocument(item.id)}
                />
              ) : null}

              <TextField
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
                      variant="danger"
                      fullWidth={false}
                      loading={updatingId === item.id}
                      onPress={() => decide(item, 'rejected')}
                    />
                  </>
                ) : item.verification_status === 'approved' ? (
                  <Button
                    label="Suspend"
                    variant="danger"
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

function makeStyles({ colors, space, radius, typography, borders }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.surface,
      paddingTop: space[3],
    },
    list: {
      paddingHorizontal: space[4],
      paddingBottom: space[4],
    },
    card: {
      backgroundColor: colors.surface,
      borderWidth: borders.hairline,
      borderColor: colors.line,
      borderRadius: radius.md,
      padding: space[3],
      marginBottom: space[3],
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: space[1],
    },
    name: {
      ...typography.bodyStrong,
      color: colors.ink,
    },
    detail: {
      ...typography.caption,
      color: colors.ink2,
      marginTop: space[1] / 2,
    },
    badgeRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: space[1],
      marginTop: space[2],
    },
    docButton: {
      marginTop: space[2],
      alignSelf: 'flex-start',
    },
    actions: {
      flexDirection: 'row',
      gap: space[2],
      marginTop: space[1],
    },
  });
}
