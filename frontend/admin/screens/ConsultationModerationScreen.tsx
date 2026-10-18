import { useFocusEffect } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Stethoscope } from 'lucide-react-native';
import { Chip, ChipRow, ListRow, ScreenState, StatusBadge } from '../../common/components';
import { ADMIN_HOME_ROUTES } from '../../common/constants/routes';
import type { AdminScreenProps } from '../../navigation/stacks/AdminNavigator';
import { useTheme, type Theme } from '../../theme';
import { useAdminConsultations } from '../hooks/admin';
import type { ConsultationStatus } from '../types/consultations';

type Filter = ConsultationStatus | 'all';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'requested', label: 'Requested' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
  { value: 'cancelled', label: 'Cancelled' },
];

// The same week the Overview's "Stale consultations" queue counts (admin_queue_counts).
const STALE_DAYS = 7;

const OPENED = new Intl.DateTimeFormat('en-PK', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * Every consultation on the platform (SRDS §14), filtered on the server by status and by age. The admin opens one to
 * close or cancel it; the list itself changes nothing.
 */
export function ConsultationModerationScreen({ navigation, route }: AdminScreenProps<typeof ADMIN_HOME_ROUTES.ConsultationModeration>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const staleRequested = route.params?.stale ?? false;
  const [filter, setFilter] = useState<Filter>('all');
  const [staleOnly, setStaleOnly] = useState(staleRequested);
  const query = useAdminConsultations(filter === 'all' ? undefined : filter, staleOnly ? STALE_DAYS : undefined);
  const { refetch } = query;

  // The Overview's tile can open this screen again with `stale`; the toggle follows it (adjusted during render, not in
  // an effect, so the list never draws once with the old filter).
  const [seenStale, setSeenStale] = useState(staleRequested);
  if (staleRequested !== seenStale) {
    setSeenStale(staleRequested);
    if (staleRequested) setStaleOnly(true);
  }

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  return (
    <View style={styles.screen}>
      <ChipRow options={FILTERS} value={filter} onChange={setFilter} />
      <View style={styles.toggle}>
        <Chip label={`Older than ${STALE_DAYS} days`} selected={staleOnly} onPress={() => setStaleOnly(value => !value)} />
      </View>
      <ScreenState
        query={query}
        errorTitle="Couldn't load the consultations"
        empty={{
          title: 'No consultations here',
          description: staleOnly ? `Nothing has been waiting for more than ${STALE_DAYS} days.` : 'Try a different filter.',
          icon: Stethoscope,
        }}
      >
        {data => (
          <FlashList
            data={data}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <ListRow
                title={item.subject}
                meta={`${item.user?.full_name || 'Unknown farmer'} → ${item.expert?.full_name || 'No expert yet'} · ${OPENED.format(new Date(item.created_at))}`}
                trailing={<StatusBadge kind="consultation" status={item.status} size="sm" />}
                onPress={() => navigation.navigate(ADMIN_HOME_ROUTES.ConsultationModerationDetail, { consultationId: item.id })}
              />
            )}
          />
        )}
      </ScreenState>
    </View>
  );
}

function makeStyles({ colors, space }: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.surface, paddingTop: space[3] },
    toggle: { flexDirection: 'row', paddingHorizontal: space[4], paddingTop: space[2] },
    list: { paddingHorizontal: space[4], paddingTop: space[2], paddingBottom: space[4] },
  });
}
