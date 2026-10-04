import { useFocusEffect } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import { FileCheck } from 'lucide-react-native';
import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Banner, Button, ChipRow, EmptyState, ListRow, Spinner, StatusBadge } from '../../common/components';
import { ADMIN_HOME_ROUTES } from '../../common/constants/routes';
import type { AdminScreenProps } from '../../navigation/stacks/AdminNavigator';
import { useTheme, type Theme } from '../../theme';
import { errorMessage } from '../../utils/errorMessage';
import { useDealerApplications, useExpertVerifications } from '../hooks/admin';

type Role = 'dealer' | 'expert';
type Status = 'pending' | 'approved' | 'rejected';
const ROLES: { value: Role; label: string }[] = [
  { value: 'dealer', label: 'Dealers' },
  { value: 'expert', label: 'Experts' },
];
const STATUSES: { value: Status; label: string }[] = [
  { value: 'pending', label: 'Waiting' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

interface Row {
  id: string;
  name: string;
  meta: string;
  status: Status;
}

const shortDate = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const sent = (at: string | null | undefined) => (at ? `Sent ${shortDate.format(new Date(at))}` : 'Not sent yet');

/**
 * The admin's review queue (SRDS §12): dealer and expert applications that were submitted, oldest first, and those
 * already decided. A decision is made only from an application's own screen, after reading it and its documents.
 */
export function ApprovalsScreen({ navigation }: AdminScreenProps<typeof ADMIN_HOME_ROUTES.Approvals>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [role, setRole] = useState<Role>('dealer');
  const [status, setStatus] = useState<Status>('pending');
  const dealers = useDealerApplications(status);
  const experts = useExpertVerifications(status);
  const query = role === 'dealer' ? dealers : experts;
  const { refetch } = query;

  // A decision made on the detail screen shows here on return.
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  const rows: Row[] =
    role === 'dealer'
      ? (dealers.data ?? []).map(d => ({
          id: d.id,
          name: d.full_name || 'Unnamed dealer',
          meta: [d.dealer_profile?.business_name, sent(d.application_submitted_at)].filter(Boolean).join(' · '),
          status: d.account_status,
        }))
      : (experts.data ?? []).map(e => ({
          id: e.id,
          name: e.profile?.full_name || 'Unnamed expert',
          meta: [e.qualifications, sent(e.profile?.application_submitted_at)].filter(Boolean).join(' · '),
          status: e.profile?.account_status ?? 'pending',
        }));

  return (
    <View style={styles.screen}>
      <View style={styles.filters}>
        <ChipRow options={ROLES} value={role} onChange={setRole} />
        <ChipRow options={STATUSES} value={status} onChange={setStatus} />
        <Button
          label="Required documents"
          icon={FileCheck}
          variant="quiet"
          size="sm"
          fullWidth={false}
          onPress={() => navigation.navigate(ADMIN_HOME_ROUTES.RequiredDocuments)}
        />
      </View>
      {query.isPending ? (
        <Spinner />
      ) : query.error ? (
        <Banner tone="danger" actionLabel="Try again" onAction={() => query.refetch()}>
          {errorMessage(query.error)}
        </Banner>
      ) : (
        <FlashList
          data={rows}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <ListRow
              title={item.name}
              meta={item.meta}
              trailing={<StatusBadge kind="application" status={item.status} />}
              onPress={() => navigation.navigate(ADMIN_HOME_ROUTES.ApplicationDetail, { role, id: item.id })}
            />
          )}
          ListEmptyComponent={
            <EmptyState title={status === 'pending' ? 'No application is waiting' : `No ${status} applications`} />
          }
        />
      )}
    </View>
  );
}

function makeStyles({ colors, space }: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.surface },
    filters: { gap: space[2], paddingTop: space[3], paddingHorizontal: space[4] },
    list: { padding: space[4] },
  });
}
