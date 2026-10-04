import { useMutation, useQuery } from '@tanstack/react-query';
import { fetchFarmerProfile, upsertFarmerProfile } from '../../../farmer';
import {
  deleteOwnAccount,
  requestReauthentication,
  resubmitApplication,
  updatePassword,
  updateProfile,
  uploadAvatar,
} from '../services/profileService';
import type { PickedPhoto } from '../../../utils/photoPicker';
import { queryKeys } from '../../../hooks/keys';

export function useUpdatePassword() {
  return useMutation({
    mutationFn: (input: string | { password: string; nonce: string }) =>
      typeof input === 'string' ? updatePassword(input) : updatePassword(input.password, input.nonce),
  });
}

/** Sends the code a password change asks for; nothing is cached (each request sends a new code). */
export function useRequestReauthentication() {
  return useMutation({ mutationFn: () => requestReauthentication() });
}

/** Deleting the account signs the user out through the auth store's session listener, so nothing is invalidated here. */
export function useDeleteOwnAccount() {
  return useMutation({ mutationFn: (password: string) => deleteOwnAccount(password) });
}

/** Sending a rejected application back for review; the caller refreshes the profile to show it pending. */
export function useResubmitApplication() {
  return useMutation({ mutationFn: () => resubmitApplication() });
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
