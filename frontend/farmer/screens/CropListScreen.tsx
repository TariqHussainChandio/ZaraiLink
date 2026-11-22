import { useFocusEffect } from '@react-navigation/native';
import { Plus, Sprout } from 'lucide-react-native';
import React, { useCallback } from 'react';
import { Button, ListGroup, ListRow, QueryState, ScreenScaffold, StickyActionBar } from '../../common/components';
import { HOME_ROUTES } from '../../common/constants/routes';
import type { HomeScreenProps } from '../../navigation/stacks/HomeNavigator';
import { formatDay } from '../../utils/dates';
import { cropMeta } from '../constants/forms';
import { useFarmCrops } from '../hooks/farmer';

/** Every crop on one farm. The farm's own summary lists the same crops; this screen stays for a direct link to them. */
export function CropListScreen({ route, navigation }: HomeScreenProps<'CropList'>) {
  const { farmId } = route.params;
  const query = useFarmCrops(farmId);
  const { data: crops, refetch } = query;

  // Coming back from adding or editing a crop shows the change.
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  const reload = () => {
    refetch();
  };
  const addCrop = () => navigation.navigate(HOME_ROUTES.AddCrop, { farmId });

  return (
    <ScreenScaffold
      onRefresh={reload}
      refreshing={query.isRefetching && !query.isPending}
      footer={
        crops && crops.length > 0 ? (
          <StickyActionBar>
            <Button label="Add crop" size="lg" icon={Plus} onPress={addCrop} />
          </StickyActionBar>
        ) : undefined
      }
    >
      <QueryState
        query={query}
        failureTitle="Couldn't load the crops"
        isEmpty={crops?.length === 0}
        empty={{
          icon: Sprout,
          title: 'No crops recorded',
          description: 'Add what is growing on this farm.',
          actionLabel: 'Add crop',
          onAction: addCrop,
        }}
      >
        <ListGroup>
          {(crops ?? []).map(crop => {
            // A date with no time is a calendar day, not an instant: read it as UTC so no zone moves it.
            const planted = crop.planting_date ? `Planted ${formatDay(crop.planting_date, { timeZone: 'UTC' })}` : undefined;
            return (
              <ListRow
                key={crop.id}
                title={crop.crop?.name ?? 'Crop not chosen'}
                meta={[cropMeta(crop), planted].filter(Boolean).join(' · ') || 'No details yet'}
                onPress={() => navigation.navigate(HOME_ROUTES.AddCrop, { farmId, cropId: crop.id })}
              />
            );
          })}
        </ListGroup>
      </QueryState>
    </ScreenScaffold>
  );
}
