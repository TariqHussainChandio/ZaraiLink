import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { FlatList, Linking, StyleSheet, Text, View } from 'react-native';
import { Badge, Button, FilterChips, Input, Spinner } from '../../components/ui';
import {
  fetchExpertsForAdmin,
  resolveExpertDocumentUrl,
  reviewExpertVerification,
  type ExpertWithVerifications,
} from '../../services/modules/expert/expertService';
import { useAuthStore } from '../../store/authStore';
import { lightTheme } from '../../theme';
import type { VerificationStatus } from '../../types/expert';

const { colors, spacing, typography } = lightTheme;

type FilterValue = VerificationStatus | 'all';

const FILTERS: { value: FilterValue; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'all', label: 'All' },
];

const STATUS_TONE: Record<VerificationStatus, 'warning' | 'success' | 'error' | 'neutral'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'error',
  suspended: 'error',
};

export function ExpertVerificationScreen() {
  const actorId = useAuthStore(state => state.user?.id);
  const [filter, setFilter] = useState<FilterValue>('pending');
  const [experts, setExperts] = useState<ExpertWithVerifications[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setExperts(await fetchExpertsForAdmin(filter === 'all' ? undefined : filter));
    setLoading(false);
  }, [filter]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const decide = async (expert: ExpertWithVerifications, decision: VerificationStatus) => {
    if (!actorId) return;
    const latestVerification = expert.expert_verifications[0];
    if (!latestVerification) return;

    setUpdatingId(expert.id);
    try {
      await reviewExpertVerification(expert.id, latestVerification.id, decision, notes[expert.id] ?? '');
      await load();
    } finally {
      setUpdatingId(null);
    }
  };

  const viewDocument = async (expertId: string) => {
    const url = await resolveExpertDocumentUrl(expertId);
    if (url) Linking.openURL(url);
  };

  if (loading) return <Spinner fullscreen />;

  return (
    <View style={styles.container}>
      <FilterChips options={FILTERS} value={filter} onChange={setFilter} />
      <FlatList
        contentContainerStyle={styles.list}
        data={experts}
        keyExtractor={item => item.id}
        ListEmptyComponent={<Text style={styles.empty}>No experts in this status.</Text>}
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.neutral.white,
    paddingTop: spacing.md,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  empty: {
    textAlign: 'center',
    color: colors.neutral.gray500,
    marginTop: spacing.xl,
  },
  card: {
    backgroundColor: colors.neutral.white,
    borderWidth: 1,
    borderColor: colors.neutral.gray200,
    borderRadius: lightTheme.radii.lg,
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
    fontWeight: typography.weights.semibold as any,
    color: colors.neutral.gray900,
  },
  detail: {
    fontSize: typography.sizes.sm,
    color: colors.neutral.gray600,
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
