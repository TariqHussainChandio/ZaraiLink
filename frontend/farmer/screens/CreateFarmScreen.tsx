import React from 'react';
import { useSnackbar } from '../../common/components';
import type { HomeScreenProps } from '../../navigation/stacks/HomeNavigator';
import { errorMessage } from '../../utils/errorMessage';
import { FarmForm, farmInputFromValues, type FarmFormValues } from '../components/FarmForm';
import { useCreateFarm } from '../hooks/farmer';

export function CreateFarmScreen({ navigation }: HomeScreenProps<'CreateFarm'>) {
  const createFarm = useCreateFarm();
  const snackbar = useSnackbar();

  const onSubmit = async (values: FarmFormValues) => {
    try {
      await createFarm.mutateAsync(farmInputFromValues(values));
    } catch (error) {
      snackbar.show(`Couldn't add the farm. ${errorMessage(error)}`);
      return;
    }
    snackbar.show('Farm added');
    navigation.goBack();
  };

  return <FarmForm submitLabel="Add farm" submitting={createFarm.isPending} onSubmit={onSubmit} />;
}
