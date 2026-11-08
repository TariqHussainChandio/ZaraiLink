import { zodResolver } from '@hookform/resolvers/zod';
import React, { useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  Banner,
  Button,
  ConfirmSheet,
  isValidE164,
  PhoneInput,
  QueryState,
  ScreenScaffold,
  SelectField,
  StickyActionBar,
  TextField,
  useSnackbar,
} from '../../common/components';
import { useDeleteSupplier, useSaveSupplier, useSupplier } from '../hooks/dealer';
import { useAuthStore } from '../../state/authStore';
import type { HomeScreenProps } from '../../navigation/stacks/HomeNavigator';
import { errorMessage } from '../../utils/errorMessage';

const supplierSchema = z.object({
  name: z.string().trim().min(2, 'Enter a supplier name'),
  // PhoneInput sends E.164, or the text as typed while it is not yet a number: the latter fails here, inline.
  contact: z.string().refine(value => value === '' || isValidE164(value), 'Enter a phone number like 0300 1234567'),
  productsSupplied: z.string(),
  notes: z.string(),
  status: z.enum(['active', 'inactive']),
});

type SupplierFormValues = z.infer<typeof supplierSchema>;

const STATUS_OPTIONS = [
  { id: 'active', label: 'Active' },
  { id: 'inactive', label: 'Inactive' },
];

export function SupplierDetailScreen({ route, navigation }: HomeScreenProps<'SupplierDetail'>) {
  const supplierId = route.params?.supplierId;
  const userId = useAuthStore(state => state.user?.id);
  const snackbar = useSnackbar();
  const saveSupplier = useSaveSupplier();
  const removeSupplier = useDeleteSupplier();
  const [failure, setFailure] = useState<unknown>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<SupplierFormValues>({
    resolver: zodResolver(supplierSchema),
    defaultValues: { name: '', contact: '', productsSupplied: '', notes: '', status: 'active' },
  });

  const query = useSupplier(supplierId);
  const supplier = query.data;

  // Fill the form once, from the first copy of the supplier; a later background refetch must not overwrite edits.
  const filled = useRef(false);
  useEffect(() => {
    if (!supplier || filled.current) return;
    filled.current = true;
    reset({
      name: supplier.name,
      contact: supplier.contact ?? '',
      productsSupplied: supplier.products_supplied ?? '',
      notes: supplier.notes ?? '',
      status: supplier.status,
    });
  }, [supplier, reset]);

  const onSubmit = async (values: SupplierFormValues) => {
    if (!userId) return;
    setFailure(null);
    try {
      await saveSupplier.mutateAsync({
        id: supplierId,
        input: {
          name: values.name,
          contact: values.contact || null,
          productsSupplied: values.productsSupplied || null,
          notes: values.notes || null,
          status: values.status,
        },
      });
      snackbar.show(supplierId ? 'Changes saved' : 'Supplier added');
      navigation.goBack();
    } catch (err) {
      setFailure(err);
    }
  };

  const form = (
    <>
      {failure ? (
        <Banner tone="danger" title="Couldn't save the supplier">
          {errorMessage(failure)}
        </Banner>
      ) : null}

      <Controller
        control={control}
        name="name"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextField label="Supplier name" value={value} onChangeText={onChange} onBlur={onBlur} error={errors.name?.message} />
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
        name="productsSupplied"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextField label="Products supplied" optional value={value} onChangeText={onChange} onBlur={onBlur} multiline numberOfLines={2} />
        )}
      />

      <Controller
        control={control}
        name="notes"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextField label="Notes" optional value={value} onChangeText={onChange} onBlur={onBlur} multiline numberOfLines={3} />
        )}
      />

      <Controller
        control={control}
        name="status"
        render={({ field: { onChange, value } }) => (
          <SelectField label="Status" value={value} options={STATUS_OPTIONS} onSelect={onChange} searchable={false} />
        )}
      />

      {supplierId ? <Button label="Remove supplier" variant="dangerQuiet" onPress={() => setConfirmRemove(true)} /> : null}
    </>
  );

  return (
    <ScreenScaffold
      footer={
        <StickyActionBar>
          <Button
            label={supplierId ? 'Save changes' : 'Add supplier'}
            size="lg"
            loading={saveSupplier.isPending}
            disabled={!!supplierId && !supplier}
            onPress={handleSubmit(onSubmit)}
          />
        </StickyActionBar>
      }
    >
      {supplierId ? (
        <QueryState query={query} failureTitle="Couldn't load this supplier">
          {form}
        </QueryState>
      ) : (
        form
      )}

      <ConfirmSheet
        visible={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        title={`Remove ${supplier?.name ?? 'this supplier'}?`}
        message="They leave your list of suppliers. This cannot be undone."
        confirmLabel="Remove supplier"
        keepLabel="Keep supplier"
        destructive
        onConfirm={async () => {
          if (!supplierId) return;
          await removeSupplier.mutateAsync(supplierId);
          snackbar.show('Supplier removed');
          navigation.goBack();
        }}
      />
    </ScreenScaffold>
  );
}
