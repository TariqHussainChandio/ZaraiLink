import { useFocusEffect, useNavigation } from '@react-navigation/native';
import React, { useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { EmptyState, Spinner } from '../../components/ui';
import { ConsultationCard } from '../../components/features/expert/ConsultationCard';
import { CONSULTATIONS_ROUTES } from '../../constants/routes';
import { useConsultations } from '../../hooks/api/consultations';
import { useAuthStore } from '../../store/authStore';
import { useTheme, type Theme } from '../../theme';

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
  const { data: consultations = [], isPending, error, refetch } = useConsultations(isExpert, !!userId);
  const loading = isPending && !!userId;
  const load = () => refetch();

  useFocusEffect(
    useCallback(() => {
      if (userId) refetch();
    }, [userId, refetch]),
  );

  if (loading) return <Spinner fullscreen />;
  if (error && consultations.length === 0) {
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
      <FlashList
        data={consultations}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <ConsultationCard
            consultation={item}
            counterpartyName={
              (isExpert ? item.user?.full_name : item.expert?.full_name) ??
              'Unknown'
            }
            onPress={() =>
              navigation.navigate(CONSULTATIONS_ROUTES.ConsultationDetail, { consultationId: item.id })
            }
          />
        )}
        ListEmptyComponent={
          <EmptyState
            title={
              isExpert
                ? 'No consultation requests yet'
                : 'No consultations yet'
            }
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
