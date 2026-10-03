import { zodResolver } from '@hookform/resolvers/zod';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Alert, Image, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { z } from 'zod';
import { Avatar, Button, TextField, LocationPicker, PhoneInput, isValidE164 } from '../../components';
import { useFarmerProfile, useUpdateProfile, useUploadAvatar, useUpsertFarmerProfile } from '../hooks/profile';
import { useAuthStore } from '../../../state/authStore';
import { useTheme, type Theme } from '../../../theme';
import { pickFromLibrary, type PickedPhoto } from '../../../utils/photoPicker';
import type { ProfileScreenProps } from '../../../navigation/stacks/ProfileNavigator';
import { errorMessage } from '../../../utils/errorMessage';

function makeEditProfileSchema() {
  return z.object({
    fullName: z.string().min(2, 'Enter your full name'),
    phone: z
      .string()
      .nullable()
      .refine(value => !value || isValidE164(value), 'Enter a valid phone number'),
    country: z.string(),
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
  const { mutateAsync: updateProfile } = useUpdateProfile();
  const { mutateAsync: uploadAvatar } = useUploadAvatar();
  const { mutateAsync: upsertFarmerProfile } = useUpsertFarmerProfile();
  const editProfileSchema = useMemo(() => makeEditProfileSchema(), []);
  const userId = useAuthStore(state => state.user?.id);
  const profile = useAuthStore(state => state.profile);
  const refreshProfile = useAuthStore(state => state.refreshProfile);
  const [avatarUri, setAvatarUri] = useState<string | null>(profile?.avatar_url ?? null);
  const [pickedAvatar, setPickedAvatar] = useState<PickedPhoto | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const {
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<EditProfileFormValues>({
    resolver: zodResolver(editProfileSchema),
    defaultValues: {
      fullName: profile?.full_name || '',
      phone: profile?.phone ?? null,
      country: profile?.country ?? '',
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

  const country = watch('country');
  const province = watch('province');
  const city = watch('city');

  const pickAvatar = async () => {
    const [photo] = await pickFromLibrary({ selectionLimit: 1 });
    if (photo) {
      setAvatarUri(photo.uri);
      setPickedAvatar(photo);
    }
  };

  const onSubmit = async (values: EditProfileFormValues) => {
    if (!userId) return;
    setSubmitting(true);
    try {
      let avatarUrl = profile?.avatar_url ?? null;
      if (pickedAvatar) {
        avatarUrl = await uploadAvatar({ userId, image: pickedAvatar });
      }

      const location = [values.village, values.city, values.province, values.country].filter(Boolean).join(', ') || null;

      await updateProfile({
        full_name: values.fullName,
        phone: values.phone,
        location,
        country: values.country || null,
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
      navigation.goBack();
    } catch (error) {
      Alert.alert('Failed to update profile', errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity style={styles.avatarWrap} onPress={pickAvatar}>
        {avatarUri ? (
          <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
        ) : (
          <Avatar name={profile?.full_name} size={theme.size.avatarLg} />
        )}
        <View style={styles.avatarBadge} />
      </TouchableOpacity>

      <Controller
        control={control}
        name="fullName"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextField
            label="Full name"
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
          <PhoneInput
            label="Phone"
            value={value}
            onChange={onChange}
            error={errors.phone?.message}
          />
        )}
      />
      <LocationPicker
        country={country}
        province={province}
        city={city}
        onCountryChange={value => setValue('country', value ?? '')}
        onProvinceChange={value => setValue('province', value ?? '')}
        onCityChange={value => setValue('city', value ?? '')}
        labels={{ country: 'Country', province: 'Province', city: 'City' }}
      />
      <Controller
        control={control}
        name="village"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextField label="Village" value={value} onChangeText={onChange} onBlur={onBlur} />
        )}
      />
      <Controller
        control={control}
        name="street"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextField label="Street / address" value={value} onChangeText={onChange} onBlur={onBlur} />
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

      <Button
        label="Save Changes"
        loading={submitting}
        onPress={handleSubmit(onSubmit)}
        style={styles.submit}
      />
    </ScrollView>
  );
}

function makeStyles({ colors, space, size, radius }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    content: {
      padding: space[4],
    },
    avatarWrap: {
      alignSelf: 'center',
      marginBottom: space[6],
    },
    avatarImage: {
      width: size.avatarLg,
      height: size.avatarLg,
      borderRadius: radius.pill,
      backgroundColor: colors.line,
    },
    avatarBadge: {},
    submit: {
      marginTop: space[3],
    },
  });
}
