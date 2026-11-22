import { zodResolver } from '@hookform/resolvers/zod';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { ScrollView, Switch, Text, View } from 'react-native';
import { z } from 'zod';
import { Banner, Button, ScreenState, SelectField, TextField, useToast } from '../../common/components';
import { useRoleAccent, useTheme } from '../../theme';
import { ConfirmSheet } from '../components/ConfirmSheet';
import { cappedText, TEXT_LIMITS, toTextOrNull } from '../components/formValues';
import { makeScreenStyles } from '../components/screenStyles';
import { inventoryErrorMessage } from '../hooks/errors';
import { useLocations, useRemoveLocation, useSaveLocation } from '../hooks/inventory';
import { LOCATION_KIND_LABELS, type LocationKind } from '../types/inventory';
import type { INVENTORY_ROUTES, InventoryScreenProps } from '../types/navigation';

const KIND_OPTIONS = (Object.keys(LOCATION_KIND_LABELS) as LocationKind[]).map(kind => ({
  id: kind,
  label: LOCATION_KIND_LABELS[kind],
}));

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Enter a name for this location')
    .max(TEXT_LIMITS.name, `Use at most ${TEXT_LIMITS.name} characters`),
  kind: z.enum(['shop', 'godown', 'shelf', 'other']),
  address: cappedText(TEXT_LIMITS.address),
  isDefault: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

/** Adds a location or edits one. Making a location the default moves the marketplace's stock source to it (D8); the
 * default location itself cannot be removed or deactivated (the server refuses it too). */
export function LocationFormScreen({ route, navigation }: InventoryScreenProps<typeof INVENTORY_ROUTES.LocationForm>) {
  const theme = useTheme();
  const accent = useRoleAccent();
  const styles = useMemo(() => makeScreenStyles(theme), [theme]);
  const locationId = route.params?.locationId;
  const locations = useLocations();
  const location = locationId ? locations.data?.find(item => item.id === locationId) : undefined;
  const save = useSaveLocation();
  const remove = useRemoveLocation();
  const toast = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', kind: 'godown', address: '', isDefault: false },
  });

  const filled = useRef(false);
  useEffect(() => {
    if (!location || filled.current) return;
    filled.current = true;
    reset({ name: location.name, kind: location.kind, address: location.address ?? '', isDefault: location.is_default });
  }, [location, reset]);

  const onSubmit = async (values: FormValues) => {
    setFormError(null);
    const input = {
      name: values.name.trim(),
      kind: values.kind,
      address: toTextOrNull(values.address),
      // Only ever sent to make a location the default; the default moves away by choosing another one.
      ...(values.isDefault && !location?.is_default ? { is_default: true } : {}),
    };
    try {
      if (locationId) await save.mutateAsync({ id: locationId, input });
      else await save.mutateAsync({ input });
      toast.success('Location saved');
      navigation.goBack();
    } catch (err) {
      setFormError(inventoryErrorMessage(err));
    }
  };

  const onRemove = async () => {
    if (!locationId) return;
    setFormError(null);
    try {
      await remove.mutateAsync(locationId);
      setConfirmingRemove(false);
      toast.success('Location removed');
      navigation.goBack();
    } catch (err) {
      setConfirmingRemove(false);
      setFormError(inventoryErrorMessage(err));
    }
  };

  if (locationId && !location) {
    return (
      <View style={styles.screen}>
        {/* The record comes from the list: the list read failing is an error; a list that loaded without it means
            "not found". */}
        <ScreenState
          query={{ ...locations, data: location }}
          errorTitle="Couldn't load this location"
          empty={{ title: 'Location not found', description: 'It may have been removed. Go back to the list.' }}
        />
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Controller
        control={control}
        name="name"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextField label="Name" value={value} onChangeText={onChange} onBlur={onBlur} error={errors.name?.message} />
        )}
      />
      <Controller
        control={control}
        name="kind"
        render={({ field: { onChange, value } }) => (
          <SelectField label="Kind" value={value} options={KIND_OPTIONS} onSelect={onChange} searchable={false} />
        )}
      />
      <Controller
        control={control}
        name="address"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextField
            label="Address"
            optional
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            multiline
            error={errors.address?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="isDefault"
        render={({ field: { onChange, value } }) => (
          <View style={styles.row}>
            <View style={styles.grow}>
              <Text style={styles.body}>Default location</Text>
              <Text style={styles.caption}>
                {location?.is_default
                  ? 'The marketplace sells from this location. Make another one the default to change it.'
                  : 'The marketplace sells from the default location.'}
              </Text>
            </View>
            {/* Android: a Switch is found by role only with `accessible` and a label (AGENTS.md). */}
            <Switch
              accessible
              accessibilityLabel="Default location"
              accessibilityRole="switch"
              accessibilityState={{ checked: value, disabled: !!location?.is_default }}
              value={value}
              onValueChange={onChange}
              disabled={location?.is_default}
              trackColor={{ true: accent.mark, false: theme.colors.lineStrong }}
            />
          </View>
        )}
      />
      {formError ? (
        <Banner tone="danger" title="Not saved">
          {formError}
        </Banner>
      ) : null}
      <Button label={locationId ? 'Save changes' : 'Add location'} loading={save.isPending} onPress={handleSubmit(onSubmit)} />
      {locationId && !location?.is_default ? (
        <Button label="Remove location" variant="danger" onPress={() => setConfirmingRemove(true)} />
      ) : null}
      <ConfirmSheet
        visible={confirmingRemove}
        title="Remove this location?"
        message="A location with stock or history is kept as inactive so the ledger still adds up."
        confirmLabel="Remove location"
        destructive
        loading={remove.isPending}
        onConfirm={onRemove}
        onClose={() => setConfirmingRemove(false)}
      />
    </ScrollView>
  );
}
