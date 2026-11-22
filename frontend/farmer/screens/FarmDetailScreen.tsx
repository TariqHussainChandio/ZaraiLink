import { Pencil, Plus, Sprout } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  Button,
  Card,
  ConfirmSheet,
  ListGroup,
  ListRow,
  QueryState,
  ScreenScaffold,
  useSnackbar,
} from '../../common/components';
import { HOME_ROUTES } from '../../common/constants/routes';
import { useUnits } from '../../common/reference-data';
import type { HomeScreenProps } from '../../navigation/stacks/HomeNavigator';
import { type Theme, useTheme } from '../../theme';
import { errorMessage } from '../../utils/errorMessage';
import { FarmForm, farmInputFromValues, farmToFormValues, type FarmFormValues } from '../components/FarmForm';
import { cropMeta, formatArea } from '../constants/forms';
import { useDeleteFarm, useFarm, useFarmCrops, useUpdateFarm } from '../hooks/farmer';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** One farm (FA-21): where it is, how big, and the crops growing on it, with the next step ("Add crop") in reach. Editing
 * the farm is a second mode of this screen, so a tap on a farm no longer drops a person into a form. */
export function FarmDetailScreen({ route, navigation }: HomeScreenProps<'FarmDetail'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { farmId } = route.params;
  const snackbar = useSnackbar();
  const { data: units = [] } = useUnits();
  const farmQuery = useFarm(farmId);
  const cropsQuery = useFarmCrops(farmId);
  const updateFarm = useUpdateFarm(farmId);
  const removeFarm = useDeleteFarm();
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const farm = farmQuery.data;
  const crops = cropsQuery.data;

  const reload = () => {
    farmQuery.refetch();
    cropsQuery.refetch();
  };
  const addCrop = () => navigation.navigate(HOME_ROUTES.AddCrop, { farmId });
  const openCrop = (cropId: string) => navigation.navigate(HOME_ROUTES.AddCrop, { farmId, cropId });

  const onSave = async (values: FarmFormValues) => {
    try {
      await updateFarm.mutateAsync(farmInputFromValues(values));
    } catch (err) {
      snackbar.show(`Couldn't save the farm. ${errorMessage(err)}`);
      return;
    }
    snackbar.show('Farm updated');
    setEditing(false);
  };

  const onDelete = async () => {
    await removeFarm.mutateAsync(farmId);
    snackbar.show('Farm deleted');
    navigation.goBack();
  };

  if (editing && farm) {
    return (
      <>
        <FarmForm
          initial={farmToFormValues(farm)}
          submitLabel="Save changes"
          submitting={updateFarm.isPending}
          onSubmit={onSave}
          extra={
            <View style={styles.editActions}>
              <Button label="Cancel" variant="quiet" onPress={() => setEditing(false)} />
              <Button label="Delete this farm" variant="dangerQuiet" onPress={() => setConfirmingDelete(true)} />
            </View>
          }
        />
        <ConfirmSheet
          visible={confirmingDelete}
          onClose={() => setConfirmingDelete(false)}
          title={`Delete ${farm.name}?`}
          message={
            crops && crops.length > 0
              ? `Its ${plural(crops.length, 'recorded crop', 'recorded crops')} are removed too. This cannot be undone.`
              : 'This cannot be undone.'
          }
          confirmLabel="Delete farm"
          keepLabel="Keep the farm"
          destructive
          onConfirm={onDelete}
        />
      </>
    );
  }

  const place = [farm?.location?.city, farm?.location?.province].filter(Boolean).join(', ');
  const area = farm ? formatArea(farm.area, farm.land_unit, units) : null;

  return (
    <ScreenScaffold onRefresh={reload} refreshing={farmQuery.isRefetching && !farmQuery.isPending}>
      <QueryState query={farmQuery} failureTitle="Couldn't load this farm">
        {farm ? (
          <>
            <Card>
              <Text style={styles.farmName} accessibilityRole="header">
                {farm.name}
              </Text>
              <Text style={styles.fact}>{place || 'Place not set'}</Text>
              <Text style={styles.fact}>{area ? `${area} of land` : 'Area not set'}</Text>
              {farm.notes ? <Text style={styles.notes}>{farm.notes}</Text> : null}
            </Card>
            <Button label="Edit farm" variant="secondary" icon={Pencil} onPress={() => setEditing(true)} />
          </>
        ) : null}
      </QueryState>

      {farm ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Crops on this farm</Text>
          <QueryState
            query={cropsQuery}
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
            {crops && crops.length > 0 ? (
              <>
                <ListGroup>
                  {crops.map(crop => (
                    <ListRow key={crop.id} title={crop.crop?.name ?? 'Crop not chosen'} meta={cropMeta(crop)} onPress={() => openCrop(crop.id)} />
                  ))}
                </ListGroup>
                <Button label="Add crop" variant="secondary" icon={Plus} onPress={addCrop} />
              </>
            ) : null}
          </QueryState>
        </View>
      ) : null}
    </ScreenScaffold>
  );
}

function makeStyles({ colors, space, typography }: Theme) {
  return StyleSheet.create({
    farmName: { ...typography.titleLg, color: colors.ink },
    fact: { ...typography.body, color: colors.ink2, marginTop: space[1] },
    notes: { ...typography.body, color: colors.ink, marginTop: space[3] },
    section: { gap: space[3] },
    sectionTitle: { ...typography.title, color: colors.ink },
    editActions: { gap: space[2] },
  });
}
