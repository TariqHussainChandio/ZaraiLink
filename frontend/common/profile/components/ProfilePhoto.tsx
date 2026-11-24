// Profile photo with tap to view, and change it from the gallery.
import React, { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { Avatar, PhotoViewer, Spinner, useSnackbar } from '../../components';
import { useAuthStore } from '../../../state/authStore';
import { useTheme } from '../../../theme';
import { errorMessage } from '../../../utils/errorMessage';
import { pickFromLibrary } from '../../../utils/photoPicker';
import { useUpdateProfile, useUploadAvatar } from '../hooks/profile';

/** Asks before the gallery opens. Android's own photo picker hands the app only the photo chosen, so no blanket storage
 * permission is involved; this is the person's yes to opening their gallery at all. */
function askToOpenGallery(): Promise<boolean> {
  return new Promise(resolve => {
    Alert.alert('Open your gallery?', 'ZaraiLink opens your photo gallery so you can choose a new profile picture.', [
      { text: 'Not now', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Allow', onPress: () => resolve(true) },
    ]);
  });
}

/**
 * The person's own photo in their Account's app bar (D20; `compact`), or anywhere larger. Tapping it opens the photo full screen with "Edit photo" at
 * the top right; without a photo yet, tapping goes straight to choosing one. Every role changes their own photo, the
 * admin included (20261122090000_admin_profile_photo.sql): the photo goes to their own folder in the `avatars` bucket and
 * the profile row points at it.
 */
export function ProfilePhoto({ compact = false }: { compact?: boolean }) {
  const theme = useTheme();
  const side = compact ? theme.size.avatarMd : theme.size.avatarLg;
  const styles = useMemo(() => makeStyles(side), [side]);
  const snackbar = useSnackbar();
  const profile = useAuthStore(state => state.profile);
  const userId = useAuthStore(state => state.user?.id);
  const refreshProfile = useAuthStore(state => state.refreshProfile);
  const { mutateAsync: uploadAvatar } = useUploadAvatar();
  const { mutateAsync: updateProfile } = useUpdateProfile();
  const [viewing, setViewing] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!profile) return null;

  // Asks first, picks a photo from the gallery, uploads it and saves it on the profile.
  const changePhoto = async () => {
    setViewing(false);
    if (!userId || !(await askToOpenGallery())) return;
    const [photo] = await pickFromLibrary({ selectionLimit: 1 });
    if (!photo) return;
    setSaving(true);
    try {
      const avatarUrl = await uploadAvatar({ userId, image: photo });
      await updateProfile({ avatar_url: avatarUrl });
      await refreshProfile();
      snackbar.show('Profile photo updated');
    } catch (error) {
      snackbar.show(`Couldn't change the photo. ${errorMessage(error)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Pressable
        onPress={() => (profile.avatar_url ? setViewing(true) : changePhoto())}
        disabled={saving}
        accessibilityRole="imagebutton"
        accessibilityLabel={profile.avatar_url ? 'Your profile photo' : 'Add a profile photo'}
        accessibilityHint={profile.avatar_url ? 'Opens the photo, with Edit photo' : 'Opens your gallery'}
        style={styles.photo}
      >
        <Avatar name={profile.full_name} uri={profile.avatar_url} role={profile.role} size={side} ring={!compact} />
        {saving ? (
          <View style={styles.saving}>
            <Spinner />
          </View>
        ) : null}
      </Pressable>
      {profile.avatar_url ? (
        <PhotoViewer
          visible={viewing}
          onClose={() => setViewing(false)}
          photos={[{ uri: profile.avatar_url, label: 'Your profile photo' }]}
          action={{ label: 'Edit photo', onPress: changePhoto }}
        />
      ) : null}
    </>
  );
}

// Builds the round photo styles for the given size.
function makeStyles(side: number) {
  return StyleSheet.create({
    photo: { width: side, height: side, alignItems: 'center', justifyContent: 'center' },
    saving: { position: 'absolute' },
  });
}
