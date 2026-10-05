import { useMutation, useQuery } from '@tanstack/react-query';
import { fetchFarmerProfile, upsertFarmerProfile } from '../../../farmer';
import {
  confirmEmailChangeCode,
  deleteOwnAccount,
  requestEmailChange,
  requestReauthentication,
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

export function useRequestEmailChange() {
  return useMutation({ mutationFn: (newEmail: string) => requestEmailChange(newEmail) });
}

/** Both codes, the current address's first; the email changes when the second is accepted. */
export function useConfirmEmailChange() {
  return useMutation({
    mutationFn: async ({ currentEmail, currentCode, newEmail, newCode }: { currentEmail: string; currentCode: string; newEmail: string; newCode: string }) => {
      await confirmEmailChangeCode(currentEmail, currentCode);
      await confirmEmailChangeCode(newEmail, newCode);
    },
  });
}
