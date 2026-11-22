import { useFocusEffect } from '@react-navigation/native';
import { FileCheck } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import { Button, ChipRow, ListGroup, ListRow, QueryState, ScreenScaffold, StatusBadge } from '../../common/components';
import { ADMIN_HOME_ROUTES } from '../../common/constants/routes';
import { statusMeta } from '../../common/constants/status';
import type { AdminScreenProps } from '../../navigation/stacks/AdminNavigator';
import { formatDay } from '../../utils/dates';
import { useDealerApplications, useExpertVerifications } from '../hooks/admin';

type Role = 'dealer' | 'expert';
type Status = 'pending' | 'approved' | 'rejected';
const ROLES: { value: Role; label: string }[] = [
  { value: 'dealer', label: 'Dealers' },
  { value: 'expert', label: 'Experts' },
];
// The same words as the badge on each row and on the applicant's own screen (AD-17).
const STATUSES: { value: Status; label: string }[] = (['pending', 'approved', 'rejected'] as const).map(value => ({
  value,
  label: statusMeta('application', value).label,
}));

interface Row {
  id: string;
  name: string;
  meta: string;
  status: Status;
}

const sent = (at: string | null | undefined) => (at ? `Sent ${formatDay(at)}` : 'Not sent yet');

/**
 * The admin's review queue (SRDS §12): dealer and expert applications that were submitted, oldest first, and those
 * already decided. A decision is made only from an application's own screen, after reading it and its documents.
 */
export function ApprovalsScreen({ navigation }: AdminScreenProps<typeof ADMIN_HOME_ROUTES.Approvals>) {
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
    <ScreenScaffold onRefresh={() => refetch()} refreshing={query.isRefetching}>
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
      <QueryState
        query={query}
        failureTitle="Couldn't load applications"
        isEmpty={rows.length === 0}
        empty={{
          title: status === 'pending' ? 'No application is waiting' : `No ${statusMeta('application', status).label.toLowerCase()} applications`,
          description: status === 'pending' ? 'New applications show up here as people send them.' : undefined,
        }}
      >
        <ListGroup>
          {rows.map(item => (
            <ListRow
              key={item.id}
              title={item.name}
              meta={item.meta}
              status={<StatusBadge kind="application" status={item.status} />}
              onPress={() => navigation.navigate(ADMIN_HOME_ROUTES.ApplicationDetail, { role, id: item.id })}
            />
          ))}
        </ListGroup>
      </QueryState>
    </ScreenScaffold>
  );
}
