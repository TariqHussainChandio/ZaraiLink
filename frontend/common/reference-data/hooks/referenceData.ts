import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createRefDataRow,
  deleteRefDataRow,
  fetchRefDataRows,
  fetchUnits,
  updateRefDataRow,
  type RefDataTable,
} from '../services/referenceDataService';
import { queryKeys } from '../../../hooks/keys';

export type { RefDataTable };

/** Admin-curated reference data changes rarely, so a day-old copy is fine (an admin edit invalidates it at once). */
const REFERENCE_STALE_TIME = 24 * 60 * 60 * 1000;

export function useUnits() {
  return useQuery({ queryKey: queryKeys.referenceData.units(), queryFn: fetchUnits, staleTime: REFERENCE_STALE_TIME });
}

/** The raw rows of one reference table, for the admin editor. */
export function useRefDataRows(table: RefDataTable) {
  return useQuery({ queryKey: queryKeys.referenceData.rows(table), queryFn: () => fetchRefDataRows(table), staleTime: 0 });
}

/** An edit must not leave any consumer (farm forms, the editor itself) serving the copy from before it. */
function useInvalidateReferenceData() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.referenceData.all });
}

export function useSaveRefDataRow(table: RefDataTable) {
  const invalidate = useInvalidateReferenceData();
  return useMutation({
    mutationFn: ({ id, row }: { id?: string; row: Record<string, unknown> }) =>
      id ? updateRefDataRow(table, id, row) : createRefDataRow(table, row),
    onSuccess: invalidate,
  });
}

export function useDeleteRefDataRow(table: RefDataTable) {
  const invalidate = useInvalidateReferenceData();
  return useMutation({ mutationFn: (id: string) => deleteRefDataRow(table, id), onSuccess: invalidate });
}
