import { useFocusEffect, useNavigation } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { EmptyState, Spinner } from '../../components/ui';
import { ConsultationCard } from '../../components/features/expert/ConsultationCard';
import { CONSULTATIONS_ROUTES } from '../../constants/routes';
import { fetchConsultationsForExpert, fetchConsultationsForUser } from '../../services/modules/expert/consultationService';
import { useAuthStore } from '../../store/authStore';
import { useTheme, type Theme } from '../../theme';
import type { ConsultationWithRelations } from '../../types/expert';

// Registered in two different navigators (the requester-side ConsultationsNavigator and
// ExpertNavigator's own consultations stack) with the same route names but different param
// list types — untyped navigation here, matching NotificationListScreen's approach.
export function ConsultationListScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const userId = useAuthStore(state => state.user?.id);
  const role = useAuthStore(state => state.role);
  const navigation = useNavigation<any>();
  const isExpert = role === 'expert';
  const [consultations, setConsultations] = useState<ConsultationWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    if (!userId) return () => {};
    let cancelled = false;
    setLoading(true);
    setError(false);
    const fetcher = isExpert ? fetchConsultationsForExpert : fetchConsultationsForUser;
    fetcher().then(data => {
      if (!cancelled) {
        setConsultations(data);
        setLoading(false);
      }
    }).catch(err => {
      console.warn('[ConsultationListScreen] failed to load consultations:', err);
      if (!cancelled) {
        setError(true);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [userId, isExpert]);

  useFocusEffect(useCallback(() => load(), [load]));

  if (loading) return <Spinner fullscreen />;
  if (error) {
    return (
      <EmptyState
        title="Couldn't load consultations"
        description="Check your connection and try again."
        actionLabel="Retry"
        onAction={load}
      />
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={consultations}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <ConsultationCard
            consultation={item}
            counterpartyName={(isExpert ? item.user?.full_name : item.expert?.full_name) ?? 'Unknown'}
            onPress={() =>
              navigation.navigate(CONSULTATIONS_ROUTES.ConsultationDetail, { consultationId: item.id })
            }
          />
        )}
        ListEmptyComponent={
          <EmptyState
            title={isExpert ? 'No consultation requests yet' : 'No consultations yet'}
            description={
              isExpert
                ? 'Requests from farmers and buyers will show up here.'
                : 'Browse verified experts to request a consultation.'
            }
          />
        }
      />
    </View>
  );
}

function makeStyles({ colors, spacing }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background.surface,
    },
    list: {
      padding: spacing.lg,
    },
  });
}
