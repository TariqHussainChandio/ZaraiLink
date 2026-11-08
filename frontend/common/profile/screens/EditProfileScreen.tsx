import { zodResolver } from '@hookform/resolvers/zod';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';
import { z } from 'zod';
import { Avatar, Banner, Button, TextField, LocationPicker, PhoneInput, ScreenScaffold, isValidE164, useSnackbar } from '../../components';
import { FormErrorSummary } from '../../auth';
import { COUNTRY } from '../../constants/locations';
import { useFarmerProfile, useUpdateProfile, useUploadAvatar, useUpsertFarmerProfile } from '../hooks/profile';
import { useAuthStore } from '../../../state/authStore';
import { useTheme, type Theme } from '../../../theme';
import { pickFromLibrary, type PickedPhoto } from '../../../utils/photoPicker';
import type { ProfileScreenProps } from '../../../navigation/stacks/ProfileNavigator';
import { errorMessage } from '../../../utils/errorMessage';

function makeEditProfileSchema() {
  return z.object({
    fullName: z.string().trim().min(2, 'Enter your full name'),
    phone: z
      .string()
      .nullable()
      .refine(value => !value || isValidE164(value), 'Enter a phone number like 0300 1234567'),
    province: z.string(),
    city: z.string(),
    village: z.string(),
    street: z.string(),
    // Farmer-only (§8.1); left blank/unused for other roles and only persisted for farmers.
    experience: z.string(),
    agriculturalInfo: z.string(),
  });
}

type EditProfileFormValues = z.infer<ReturnType<typeof makeEditProfileSchema>>;

export function EditProfileScreen({ navigation }: ProfileScreenProps<'EditProfile'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const snackbar = useSnackbar();
  const { mutateAsync: updateProfile } = useUpdateProfile();
  const { mutateAsync: uploadAvatar } = useUploadAvatar();
  const { mutateAsync: upsertFarmerProfile } = useUpsertFarmerProfile();
  const editProfileSchema = useMemo(() => makeEditProfileSchema(), []);
  const userId = useAuthStore(state => state.user?.id);
  const profile = useAuthStore(state => state.profile);
  const refreshProfile = useAuthStore(state => state.refreshProfile);
  const [avatarUri, setAvatarUri] = useState<string | null>(profile?.avatar_url ?? null);
  const [pickedAvatar, setPickedAvatar] = useState<PickedPhoto | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const {
    control,
    handleSubmit,
    reset,
    setFocus,
    watch,
    setValue,
    formState: { errors, submitCount },
  } = useForm<EditProfileFormValues>({
    resolver: zodResolver(editProfileSchema),
    defaultValues: {
      fullName: profile?.full_name || '',
      phone: profile?.phone ?? null,
      province: profile?.province ?? '',
      city: profile?.city ?? '',
      village: profile?.village ?? '',
      street: profile?.street ?? '',
      experience: '',
      agriculturalInfo: '',
    },
  });

  // The farmer-only fields arrive after the rest of the form; fill them once, without touching what was typed.
  const { data: farmerProfile } = useFarmerProfile(!!userId && profile?.role === 'farmer');
  const farmerFieldsFilled = useRef(false);
  useEffect(() => {
    if (!farmerProfile || farmerFieldsFilled.current) return;
    farmerFieldsFilled.current = true;
    reset(current => ({
      ...current,
      experience: farmerProfile.experience ?? '',
      agriculturalInfo: farmerProfile.agricultural_info ?? '',
    }));
  }, [farmerProfile, reset]);

  const province = watch('province');
  const city = watch('city');

  const pickAvatar = async () => {
    setPhotoError(null);
    try {
      const [photo] = await pickFromLibrary({ selectionLimit: 1 });
      if (photo) {
        setAvatarUri(photo.uri);
        setPickedAvatar(photo);
      }
    } catch (error) {
      setPhotoError(errorMessage(error));
    }
  };

  const onSubmit = async (values: EditProfileFormValues) => {
    if (!userId) return;
    setSubmitting(true);
    setSaveError(null);
    try {
      let avatarUrl = profile?.avatar_url ?? null;
      if (pickedAvatar) {
        avatarUrl = await uploadAvatar({ userId, image: pickedAvatar });
      }

      // The country is not a question (Pakistan only); it is stored whenever a province or city is.
      const country = values.province || values.city ? COUNTRY : (profile?.country ?? null);
      const location = [values.village, values.city, values.province, country].filter(Boolean).join(', ') || null;

      await updateProfile({
        full_name: values.fullName,
        phone: values.phone,
        location,
        country,
        province: values.province || null,
        city: values.city || null,
        village: values.village || null,
        street: values.street || null,
        avatar_url: avatarUrl,
      });

      if (profile?.role === 'farmer') {
        await upsertFarmerProfile({
          experience: values.experience || null,
          agriculturalInfo: values.agriculturalInfo || null,
        });
      }

      await refreshProfile();
      snackbar.show('Profile saved');
      navigation.goBack();
    } catch (error) {
      setSaveError(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScreenScaffold>
      <View style={styles.photo}>
        <Avatar name={profile?.full_name} uri={avatarUri} role={profile?.role} size={theme.size.avatarLg} ring />
        <Button label="Change photo" variant="secondary" size="sm" fullWidth={false} onPress={pickAvatar} />
      </View>
      {photoError ? <Banner tone="danger" title="Couldn't choose that photo">{photoError}</Banner> : null}

      <View>
        <Controller
          control={control}
          name="fullName"
          render={({ field: { ref, onChange, onBlur, value } }) => (
            <TextField
              ref={ref}
              label="Full name"
              autoComplete="name"
              textContentType="name"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.fullName?.message}
            />
          )}
        />
        <Controller
          control={control}
          name="phone"
          render={({ field: { onChange, value } }) => (
            <PhoneInput label="Phone" value={value} onChange={onChange} error={errors.phone?.message} />
          )}
        />
        <LocationPicker
          province={province || null}
          city={city || null}
          onProvinceChange={value => setValue('province', value ?? '')}
          onCityChange={value => setValue('city', value ?? '')}
        />
        <Controller
          control={control}
          name="village"
          render={({ field: { ref, onChange, onBlur, value } }) => (
            <TextField
              ref={ref}
              label="Village"
              optional
              returnKeyType="next"
              onSubmitEditing={() => setFocus('street')}
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
            />
          )}
        />
        <Controller
          control={control}
          name="street"
          render={({ field: { ref, onChange, onBlur, value } }) => (
            <TextField
              ref={ref}
              label="Street address"
              optional
              autoComplete="street-address"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
            />
          )}
        />

        {profile?.role === 'farmer' ? (
          <>
            <Controller
              control={control}
              name="experience"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextField
                  label="Experience"
                  optional
                  placeholder="e.g. 8 years growing wheat and cotton"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                />
              )}
            />
            <Controller
              control={control}
              name="agriculturalInfo"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextField
                  label="Agricultural information"
                  optional
                  placeholder="Practices, specialties, certifications, etc."
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  multiline
                  numberOfLines={3}
                />
              )}
            />
          </>
        ) : null}
      </View>

      <FormErrorSummary errors={errors} submitted={submitCount > 0} />
      {saveError ? <Banner tone="danger" title="Couldn't save your profile">{saveError}</Banner> : null}

      <Button label="Save profile" size="lg" loading={submitting} onPress={handleSubmit(onSubmit)} />
    </ScreenScaffold>
  );
}

function makeStyles({ space }: Theme) {
  return StyleSheet.create({
    photo: { flexDirection: 'row', alignItems: 'center', gap: space[4] },
  });
}
