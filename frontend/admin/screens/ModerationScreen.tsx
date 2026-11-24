// Admin: the moderation hub linking to each moderation queue with its count.
import { Flag, List, Receipt, Star, Stethoscope, Store, Tags, Users } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { StyleSheet, Text } from 'react-native';
import { ListGroup, ListRow, ListRowIcon, ScreenScaffold } from '../../common/components';
import { ADMIN_HOME_ROUTES } from '../../common/constants/routes';
import type { AdminScreenProps } from '../../navigation/stacks/AdminNavigator';
import { type Theme, useTheme } from '../../theme';
import { useAdminQueues } from '../hooks/admin';

type Queues = NonNullable<ReturnType<typeof useAdminQueues>['data']>;

const DESTINATIONS = [
  { route: ADMIN_HOME_ROUTES.UserManagement, icon: Users, title: 'Users', meta: 'Suspend accounts and change roles' },
  { route: ADMIN_HOME_ROUTES.ListingModeration, icon: Store, title: 'Listings', meta: 'Hide or restore marketplace listings' },
  {
    route: ADMIN_HOME_ROUTES.Reports,
    icon: Flag,
    title: 'Reports',
    meta: 'What buyers and sellers have reported',
    waiting: (q: Queues) => q.open_reports,
    noun: 'open',
  },
  {
    route: ADMIN_HOME_ROUTES.Orders,
    icon: Receipt,
    title: 'Orders',
    meta: 'Every order on the platform',
    waiting: (q: Queues) => q.disputed_orders,
    noun: 'disputed',
  },
  {
    route: ADMIN_HOME_ROUTES.ConsultationModeration,
    icon: Stethoscope,
    title: 'Consultations',
    meta: 'Close or cancel a consultation left open',
    waiting: (q: Queues) => q.stale_consultations,
    noun: 'left open',
  },
  { route: ADMIN_HOME_ROUTES.ReviewModeration, icon: Star, title: 'Reviews', meta: 'Hide or restore buyer reviews' },
  { route: ADMIN_HOME_ROUTES.Categories, icon: Tags, title: 'Categories', meta: 'Marketplace categories' },
  { route: ADMIN_HOME_ROUTES.ReferenceData, icon: List, title: 'Reference data', meta: 'Units and currencies' },
] as const;

/** The admin's Moderation tab: every moderation screen, one row each, with what is waiting beside the queues (the same
 * server counts as the Overview and the side menu, /admin/queues). */
export function ModerationScreen({ navigation }: AdminScreenProps<'ModerationHub'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const queues = useAdminQueues();
  return (
    <ScreenScaffold onRefresh={() => queues.refetch()} refreshing={queues.isRefetching}>
      <ListGroup>
        {DESTINATIONS.map(d => {
          const waiting = 'waiting' in d && queues.data ? d.waiting(queues.data) : 0;
          return (
            <ListRow
              key={d.route}
              title={d.title}
              meta={d.meta}
              leading={<ListRowIcon icon={d.icon} />}
              trailing={waiting > 0 ? <Text style={styles.figure}>{waiting}</Text> : undefined}
              accessibilityLabel={waiting > 0 && 'noun' in d ? `${d.title}, ${waiting} ${d.noun}. ${d.meta}` : undefined}
              onPress={() => navigation.navigate(d.route)}
            />
          );
        })}
      </ListGroup>
    </ScreenScaffold>
  );
}

// Builds the screen's styles from the theme.
function makeStyles({ colors, typography }: Theme) {
  return StyleSheet.create({
    figure: { ...typography.figure, color: colors.ink },
  });
}
