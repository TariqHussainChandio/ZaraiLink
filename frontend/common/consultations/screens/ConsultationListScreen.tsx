import { useFocusEffect, useNavigation } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { ChipRow, QueryState, ScreenScaffold } from '../../components';
import { ListGap } from '../components/ListGap';
import { ConsultationCard } from '../components/ConsultationCard';
import { CONSULTATIONS_ROUTES } from '../../constants/routes';
import { useConsultations } from '../hooks/consultations';
import { isActiveStatus } from '../utils/requests';
import { useAuthStore } from '../../../state/authStore';
import { useTheme, type Theme } from '../../../theme';

type Show = 'active' | 'resolved';

const SHOW_OPTIONS: { value: Show; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'resolved', label: 'Resolved' },
];

// Registered in two different navigators (the requester-side ConsultationsNavigator and
// ExpertNavigator's own consultations stack) with the same route names but different param
// list types — untyped navigation here, matching NotificationListScreen's approach.
/** Every consultation of the signed-in person, split into the ones still being worked on and the ones that are over
 * (resolved, closed, declined, cancelled or expired: each card still carries its own status). */
export function ConsultationListScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const userId = useAuthStore(state => state.user?.id);
  const role = useAuthStore(state => state.role);
  const navigation = useNavigation<any>();
  const isExpert = role === 'expert';
  const [show, setShow] = useState<Show>('active');
  const query = useConsultations(isExpert, !!userId);
  const { refetch } = query;
  const consultations = useMemo(() => query.data ?? [], [query.data]);
  const shown = useMemo(
    () => consultations.filter(c => isActiveStatus(c.status) === (show === 'active')),
    [consultations, show],
  );

  useFocusEffect(
    useCallback(() => {
      if (userId) refetch();
    }, [userId, refetch]),
  );

  const nothingAtAll = consultations.length === 0;
  const empty = nothingAtAll
    ? {
        title: isExpert ? 'No consultation requests yet' : 'No consultations yet',
        description: isExpert
          ? 'Requests from farmers and buyers will show up here.'
          : 'Browse verified experts to ask one for help.',
        actionLabel: isExpert ? undefined : 'Find an expert',
        onAction: isExpert ? undefined : () => navigation.navigate(CONSULTATIONS_ROUTES.ExpertList),
      }
    : {
        title: show === 'active' ? 'Nothing active right now' : 'Nothing resolved yet',
        description:
          show === 'active'
            ? 'Choose Resolved to see finished consultations.'
            : 'Finished consultations will show up here.',
      };

  return (
    <ScreenScaffold scroll={false}>
      {nothingAtAll ? null : <ChipRow options={SHOW_OPTIONS} value={show} onChange={setShow} />}
      <QueryState query={query} isEmpty={shown.length === 0} empty={empty} failureTitle="Couldn't load consultations">
        <View style={styles.list}>
          <FlashList
            data={shown}
            keyExtractor={item => item.id}
            ItemSeparatorComponent={ListGap}
            renderItem={({ item }) => (
              <ConsultationCard
                consultation={item}
                counterpartyName={(isExpert ? item.user?.full_name : item.expert?.full_name) || 'Unknown'}
                onPress={() =>
                  navigation.navigate(CONSULTATIONS_ROUTES.ConsultationDetail, {
                    consultationId: item.id,
                  })
                }
              />
            )}
          />
        </View>
      </QueryState>
    </ScreenScaffold>
  );
}

function makeStyles({ space }: Theme) {
  return StyleSheet.create({
    list: { flex: 1 },
  });
}
