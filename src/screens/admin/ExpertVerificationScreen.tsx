import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Linking, StyleSheet, Text, View } from 'react-native';
import { Badge, Button, EmptyState, FilterChips, Input, Spinner } from '../../components/ui';
import {
  fetchExpertsForAdmin,
  resolveExpertDocumentUrl,
  reviewExpertVerification,
  type ExpertWithVerifications,
} from '../../services/modules/expert/expertService';
import { useAuthStore } from '../../store/authStore';
import { useTheme, type Theme } from '../../theme';
import type { VerificationStatus } from '../../types/expert';

type FilterValue = VerificationStatus | 'all';

const STATUS_TONE: Record<VerificationStatus, 'warning' | 'success' | 'error' | 'neutral'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'error',
  suspended: 'error',
};

export function ExpertVerificationScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const filters: { value: FilterValue; label: string }[] = useMemo(
    () => [
      { value: 'pending', label: t('admin.expertVerification.pending') },
      { value: 'approved', label: t('admin.expertVerification.approved') },
      { value: 'rejected', label: t('admin.expertVerification.rejected') },
      { value: 'suspended', label: t('admin.expertVerification.suspended') },
      { value: 'all', label: t('admin.expertVerification.all') },
    ],
    [t],
  );
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
      <FilterChips options={filters} value={filter} onChange={setFilter} />
      <FlatList
        contentContainerStyle={styles.list}
        data={experts}
        keyExtractor={item => item.id}
        ListEmptyComponent={<EmptyState title={t('admin.expertVerification.emptyTitle')} />}
        renderItem={({ item }) => {
          const latestVerification = item.expert_verifications[0];
          return (
            <View style={styles.card}>
              <View style={styles.headerRow}>
                <Text style={styles.name}>{item.profile?.full_name ?? t('admin.expertVerification.unknownName')}</Text>
                <Badge label={item.verification_status} tone={STATUS_TONE[item.verification_status]} />
              </View>
              <Text style={styles.detail}>{item.degree ?? t('admin.expertVerification.noDegreeListed')}</Text>
              <Text style={styles.detail}>{item.experience ?? t('admin.expertVerification.noExperienceListed')}</Text>
              {item.qualifications ? <Text style={styles.detail}>{item.qualifications}</Text> : null}
              <View style={styles.badgeRow}>
                {item.expert_specializations.map(s => (
                  <Badge key={s.specialization} label={s.specialization.replace(/_/g, ' ')} tone="info" />
                ))}
              </View>

              {latestVerification?.document_url ? (
                <Button
                  label={t('admin.expertVerification.viewDocument')}
                  variant="ghost"
                  fullWidth={false}
                  style={styles.docButton}
                  onPress={() => viewDocument(item.id)}
                />
              ) : null}

              <Input
                placeholder={t('admin.expertVerification.decisionNotePlaceholder')}
                value={notes[item.id] ?? ''}
                onChangeText={text => setNotes(prev => ({ ...prev, [item.id]: text }))}
              />

              <View style={styles.actions}>
                {item.verification_status === 'pending' ? (
                  <>
                    <Button
                      label={t('admin.expertVerification.approve')}
                      fullWidth={false}
                      loading={updatingId === item.id}
                      onPress={() => decide(item, 'approved')}
                    />
                    <Button
                      label={t('admin.expertVerification.reject')}
                      variant="destructive"
                      fullWidth={false}
                      loading={updatingId === item.id}
                      onPress={() => decide(item, 'rejected')}
                    />
                  </>
                ) : item.verification_status === 'approved' ? (
                  <Button
                    label={t('admin.expertVerification.suspend')}
                    variant="destructive"
                    fullWidth={false}
                    loading={updatingId === item.id}
                    onPress={() => decide(item, 'suspended')}
                  />
                ) : item.verification_status === 'suspended' ? (
                  <Button
                    label={t('admin.expertVerification.reactivate')}
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
      fontWeight: typography.weights.semibold as any,
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
