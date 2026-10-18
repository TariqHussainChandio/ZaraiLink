import { useFocusEffect, useNavigation } from '@react-navigation/native';
import React, { useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { EmptyState, ScreenState, SkeletonCard } from '../../components';
import { ConsultationCard } from '../components/ConsultationCard';
import { CONSULTATIONS_ROUTES } from '../../constants/routes';
import { useConsultations } from '../hooks/consultations';
import { useAuthStore } from '../../../state/authStore';
import { useTheme, type Theme } from '../../../theme';

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
  const query = useConsultations(isExpert, !!userId);
  const { refetch } = query;
  // Signed out the query is disabled and stays "pending" for ever; show the empty list instead of a skeleton that never ends.
  const screenQuery = userId ? query : { ...query, data: query.data ?? [], isPending: false };

  useFocusEffect(
    useCallback(() => {
      if (userId) refetch();
    }, [userId, refetch]),
  );

  return (
    <View style={styles.container}>
      <ScreenState
        query={screenQuery}
        errorTitle="Couldn't load consultations"
        skeleton={
          <View style={styles.list}>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </View>
        }
      >
        {consultations => (
          <FlashList
            data={consultations}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <ConsultationCard
                consultation={item}
                counterpartyName={(isExpert ? item.user?.full_name : item.expert?.full_name) || 'Unknown'}
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
                actionLabel={isExpert ? undefined : 'Find an expert'}
                onAction={isExpert ? undefined : () => navigation.navigate(CONSULTATIONS_ROUTES.ExpertList)}
              />
            }
          />
        )}
      </ScreenState>
    </View>
  );
}

function makeStyles({ colors, space }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    list: {
      padding: space[4],
    },
  });
}
