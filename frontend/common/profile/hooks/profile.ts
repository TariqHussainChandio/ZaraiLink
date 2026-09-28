import { useMutation, useQuery } from '@tanstack/react-query';
import { fetchFarmerProfile, upsertFarmerProfile } from '../../../farmer';
import {
  deleteOwnAccount,
  updatePassword,
  updateProfile,
  uploadAvatar,
} from '../services/profileService';
import type { PickedPhoto } from '../../../utils/photoPicker';
import { queryKeys } from '../../../hooks/keys';

export function useUpdatePassword() {
  return useMutation({ mutationFn: (newPassword: string) => updatePassword(newPassword) });
}

/** Deleting the account signs the user out through the auth store's session listener, so nothing is invalidated here. */
export function useDeleteOwnAccount() {
  return useMutation({ mutationFn: (password: string) => deleteOwnAccount(password) });
}

export function useUpdateProfile() {
  return useMutation({ mutationFn: (input: Parameters<typeof updateProfile>[0]) => updateProfile(input) });
}

export function useUploadAvatar() {
  return useMutation({
    mutationFn: ({ userId, image }: { userId: string; image: PickedPhoto }) => uploadAvatar(userId, image),
  });
}

export function useFarmerProfile(enabled: boolean) {
  return useQuery({ queryKey: queryKeys.profile.farmer(), queryFn: fetchFarmerProfile, enabled });
}

export function useUpsertFarmerProfile() {
  return useMutation({ mutationFn: (input: Parameters<typeof upsertFarmerProfile>[0]) => upsertFarmerProfile(input) });
}
