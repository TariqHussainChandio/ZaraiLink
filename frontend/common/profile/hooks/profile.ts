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

/** Which of the two codes was refused, so the screen can show the error under that code's field and not the other. */
export class EmailCodeError extends Error {
  constructor(
    readonly which: 'current' | 'new',
    readonly original: unknown,
  ) {
    super(`The ${which} email's code was refused`);
    this.name = 'EmailCodeError';
  }
}

/** Both codes, the current address's first; the email changes when the second is accepted. */
export function useConfirmEmailChange() {
  return useMutation({
    // `skipCurrent`: the first code was accepted on an earlier try and a code can be used once, so only the second is retried.
    mutationFn: async ({ currentEmail, currentCode, newEmail, newCode, skipCurrent = false }: { currentEmail: string; currentCode: string; newEmail: string; newCode: string; skipCurrent?: boolean }) => {
      if (!skipCurrent) {
        await confirmEmailChangeCode(currentEmail, currentCode).catch(error => {
          throw new EmailCodeError('current', error);
        });
      }
      await confirmEmailChangeCode(newEmail, newCode).catch(error => {
        throw new EmailCodeError('new', error);
      });
    },
  });
}
