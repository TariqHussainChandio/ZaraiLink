import { zodResolver } from '@hookform/resolvers/zod';
import React, { useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  Banner,
  Button,
  ConfirmSheet,
  isValidE164,
  LocationPicker,
  PhoneInput,
  QueryState,
  ScreenScaffold,
  SelectField,
  StickyActionBar,
  TextField,
  useSnackbar,
} from '../../common/components';
import { useDeleteStore, useSaveStore, useStore } from '../hooks/dealer';
import { useAuthStore } from '../../state/authStore';
import type { HomeScreenProps } from '../../navigation/stacks/HomeNavigator';
import { errorMessage } from '../../utils/errorMessage';

const storeSchema = z.object({
  name: z.string().trim().min(2, 'Enter a store name'),
  address: z.string(),
  // PhoneInput sends E.164, or the text as typed while it is not yet a number: the latter fails here, inline.
  contact: z.string().refine(value => value === '' || isValidE164(value), 'Enter a phone number like 0300 1234567'),
  openingInfo: z.string(),
  status: z.enum(['active', 'inactive']),
  country: z.string().nullable(),
  province: z.string().nullable(),
  city: z.string().nullable(),
});

type StoreFormValues = z.infer<typeof storeSchema>;

const STATUS_OPTIONS = [
  { id: 'active', label: 'Active' },
  { id: 'inactive', label: 'Inactive' },
];

export function StoreDetailScreen({ route, navigation }: HomeScreenProps<'StoreDetail'>) {
  const storeId = route.params?.storeId;
  const userId = useAuthStore(state => state.user?.id);
  const snackbar = useSnackbar();
  const saveStore = useSaveStore();
  const removeStore = useDeleteStore();
  const [failure, setFailure] = useState<unknown>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const {
    control,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<StoreFormValues>({
    resolver: zodResolver(storeSchema),
    defaultValues: {
      name: '',
      address: '',
      contact: '',
      openingInfo: '',
      status: 'active',
      country: null,
      province: null,
      city: null,
    },
  });

  const query = useStore(storeId);
  const store = query.data;

  // Fill the form once, from the first copy of the store; a later background refetch must not overwrite edits.
  const filled = useRef(false);
  useEffect(() => {
    if (!store || filled.current) return;
    filled.current = true;
    reset({
      name: store.name,
      address: store.address ?? '',
      contact: store.contact ?? '',
      openingInfo: store.opening_info ?? '',
      status: store.status,
      country: store.location?.country ?? null,
      province: store.location?.province ?? null,
      city: store.location?.city ?? null,
    });
  }, [store, reset]);

  const onSubmit = async (values: StoreFormValues) => {
    if (!userId) return;
    setFailure(null);
    try {
      await saveStore.mutateAsync({
        id: storeId,
        input: {
          name: values.name,
          address: values.address || null,
          contact: values.contact || null,
          openingInfo: values.openingInfo || null,
          status: values.status,
          country: values.country,
          province: values.province,
          city: values.city,
        },
      });
      snackbar.show(storeId ? 'Changes saved' : 'Store added');
      navigation.goBack();
    } catch (err) {
      setFailure(err);
    }
  };

  const form = (
    <>
      {failure ? (
        <Banner tone="danger" title="Couldn't save the store">
          {errorMessage(failure)}
        </Banner>
      ) : null}

      <Controller
        control={control}
        name="name"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextField label="Store name" value={value} onChangeText={onChange} onBlur={onBlur} error={errors.name?.message} />
        )}
      />

      <LocationPicker
        country={watch('country')}
        province={watch('province')}
        city={watch('city')}
        onCountryChange={value => setValue('country', value)}
        onProvinceChange={value => setValue('province', value)}
        onCityChange={value => setValue('city', value)}
      />

      <Controller
        control={control}
        name="address"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextField label="Address" optional value={value} onChangeText={onChange} onBlur={onBlur} />
        )}
      />

      <Controller
        control={control}
        name="contact"
        render={({ field: { onChange, value } }) => (
          <PhoneInput label="Contact number" value={value || null} onChange={next => onChange(next ?? '')} error={errors.contact?.message} />
        )}
      />

      <Controller
        control={control}
        name="openingInfo"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextField label="Opening hours" optional value={value} onChangeText={onChange} onBlur={onBlur} multiline numberOfLines={2} />
        )}
      />

      <Controller
        control={control}
        name="status"
        render={({ field: { onChange, value } }) => (
          <SelectField label="Status" value={value} options={STATUS_OPTIONS} onSelect={onChange} searchable={false} />
        )}
      />

      {storeId ? <Button label="Remove store" variant="dangerQuiet" onPress={() => setConfirmRemove(true)} /> : null}
    </>
  );

  return (
    <ScreenScaffold
      footer={
        <StickyActionBar>
          <Button
            label={storeId ? 'Save changes' : 'Add store'}
            size="lg"
            loading={saveStore.isPending}
            disabled={!!storeId && !store}
            onPress={handleSubmit(onSubmit)}
          />
        </StickyActionBar>
      }
    >
      {storeId ? (
        <QueryState query={query} failureTitle="Couldn't load this store">
          {form}
        </QueryState>
      ) : (
        form
      )}

      <ConfirmSheet
        visible={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        title={`Remove ${store?.name ?? 'this store'}?`}
        message="It leaves your list of stores. This cannot be undone."
        confirmLabel="Remove store"
        keepLabel="Keep store"
        destructive
        onConfirm={async () => {
          if (!storeId) return;
          await removeStore.mutateAsync(storeId);
          snackbar.show('Store removed');
          navigation.goBack();
        }}
      />
    </ScreenScaffold>
  );
}
