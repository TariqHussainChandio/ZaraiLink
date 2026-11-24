// React Query hooks for the farmer's farms and crops (read, create, update, delete).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createFarm,
  createFarmCrop,
  deleteFarm,
  deleteFarmCrop,
  fetchFarmById,
  fetchFarmCropById,
  fetchFarmCrops,
  fetchFarms,
  updateFarm,
  updateFarmCrop,
} from '../services/farmService';
import { queryKeys } from '../../hooks/keys';

// Input shapes taken from the service functions.
type FarmInput = Parameters<typeof createFarm>[0];
type FarmCropInput = Parameters<typeof createFarmCrop>[1];

/** Farms and crops feed the farmer dashboard's counts, so those refetch with them. */
function useInvalidateFarmer() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.farmer.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all }),
    ]);
}

// Loads the signed-in farmer's farms.
export function useFarms(enabled: boolean) {
  return useQuery({ queryKey: queryKeys.farmer.farms(), queryFn: fetchFarms, enabled });
}

// Loads one farm by id.
export function useFarm(id: string) {
  return useQuery({ queryKey: queryKeys.farmer.farm(id), queryFn: () => fetchFarmById(id) });
}

// Creates a farm, then refreshes farmer data.
export function useCreateFarm() {
  const invalidate = useInvalidateFarmer();
  return useMutation({ mutationFn: (input: FarmInput) => createFarm(input), onSuccess: invalidate });
}

// Updates one farm, then refreshes farmer data.
export function useUpdateFarm(id: string) {
  const invalidate = useInvalidateFarmer();
  return useMutation({ mutationFn: (input: Partial<FarmInput>) => updateFarm(id, input), onSuccess: invalidate });
}

// Deletes a farm, then refreshes farmer data.
export function useDeleteFarm() {
  const invalidate = useInvalidateFarmer();
  return useMutation({ mutationFn: (id: string) => deleteFarm(id), onSuccess: invalidate });
}

// Loads the crops recorded on one farm.
export function useFarmCrops(farmId: string) {
  return useQuery({ queryKey: queryKeys.farmer.crops(farmId), queryFn: () => fetchFarmCrops(farmId) });
}

/** One recorded crop, for the edit form; `undefined` means a new crop is being added, so nothing is fetched. */
export function useFarmCrop(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.farmer.crop(id ?? ''),
    queryFn: () => fetchFarmCropById(id ?? ''),
    enabled: !!id,
  });
}

/** Adds a crop to a farm, or updates it when `cropId` is given. */
export function useSaveFarmCrop(farmId: string) {
  const invalidate = useInvalidateFarmer();
  return useMutation({
    mutationFn: ({ cropId, input }: { cropId?: string; input: FarmCropInput }) =>
      cropId ? updateFarmCrop(cropId, input) : createFarmCrop(farmId, input),
    onSuccess: invalidate,
  });
}

// Removes a crop from a farm, then refreshes farmer data.
export function useDeleteFarmCrop() {
  const invalidate = useInvalidateFarmer();
  return useMutation({ mutationFn: (id: string) => deleteFarmCrop(id), onSuccess: invalidate });
}
