import { useFocusEffect } from '@react-navigation/native';
import { Plus, Tractor } from 'lucide-react-native';
import React, { useCallback } from 'react';
import { Button, ListGroup, ListRow, QueryState, ScreenScaffold, StickyActionBar } from '../../common/components';
import { HOME_ROUTES } from '../../common/constants/routes';
import { useUnits } from '../../common/reference-data';
import type { HomeScreenProps } from '../../navigation/stacks/HomeNavigator';
import { useAuthStore } from '../../state/authStore';
import { formatArea } from '../constants/forms';
import { useFarms } from '../hooks/farmer';

/** The farmer's farms (FA-21): each opens a summary with its crops, and "Add farm" is a real button, not a floating one. */
export function FarmListScreen({ navigation }: HomeScreenProps<'FarmList'>) {
  const userId = useAuthStore(state => state.user?.id);
  const query = useFarms(!!userId);
  const { data: units = [] } = useUnits();
  const { data: farms, refetch } = query;

  useFocusEffect(
    useCallback(() => {
      if (userId) refetch();
    }, [userId, refetch]),
  );

  const reload = () => {
    refetch();
  };
  const addFarm = () => navigation.navigate(HOME_ROUTES.CreateFarm);

  return (
    <ScreenScaffold
      onRefresh={reload}
      refreshing={query.isRefetching && !query.isPending}
      footer={
        farms && farms.length > 0 ? (
          <StickyActionBar>
            <Button label="Add farm" size="lg" icon={Plus} onPress={addFarm} />
          </StickyActionBar>
        ) : undefined
      }
    >
      <QueryState
        query={query}
        failureTitle="Couldn't load your farms"
        isEmpty={farms?.length === 0}
        empty={{
          icon: Tractor,
          title: 'No farms yet',
          description: 'Add your farm to record its crops and get advice for them.',
          actionLabel: 'Add farm',
          onAction: addFarm,
        }}
      >
        <ListGroup>
          {(farms ?? []).map(farm => (
            <ListRow
              key={farm.id}
              title={farm.name}
              meta={[farm.location?.city, formatArea(farm.area, farm.land_unit, units) ?? 'Area not set'].filter(Boolean).join(' · ')}
              onPress={() => navigation.navigate(HOME_ROUTES.FarmDetail, { farmId: farm.id })}
            />
          ))}
        </ListGroup>
      </QueryState>
    </ScreenScaffold>
  );
}
