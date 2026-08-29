import { zodResolver } from '@hookform/resolvers/zod';
import React, { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { launchImageLibrary } from 'react-native-image-picker';
import { Alert, Image, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { z } from 'zod';
import { Avatar, Button, Input, LocationPicker, PhoneInput, isValidE164 } from '../../components/ui';
import { fetchFarmerProfile, upsertFarmerProfile } from '../../services/modules/farmer/farmService';
import { updateProfile, uploadAvatar } from '../../services/modules/profile/profileService';
import { useReferenceDataStore } from '../../store/referenceDataStore';
import { useAuthStore } from '../../store/authStore';
import { lightTheme } from '../../theme';
import type { ProfileScreenProps } from '../../navigation/stacks/ProfileNavigator';

const editProfileSchema = z.object({
  fullName: z.string().min(2, 'Enter your full name'),
  phone: z
    .string()
    .nullable()
    .refine(value => !value || isValidE164(value), 'Enter a valid phone number'),
  countryId: z.string().nullable(),
  provinceId: z.string().nullable(),
  cityId: z.string().nullable(),
  village: z.string(),
  street: z.string(),
  // Farmer-only (§8.1); left blank/unused for other roles and only persisted for farmers.
  experience: z.string(),
  agriculturalInfo: z.string(),
});

type EditProfileFormValues = z.infer<typeof editProfileSchema>;

const { spacing } = lightTheme;

export function EditProfileScreen({ navigation }: ProfileScreenProps<'EditProfile'>) {
  const { t } = useTranslation();
  const userId = useAuthStore(state => state.user?.id);
  const profile = useAuthStore(state => state.profile);
  const refreshProfile = useAuthStore(state => state.refreshProfile);
  const [avatarUri, setAvatarUri] = useState<string | null>(profile?.avatar_url ?? null);
  const [pickedAvatar, setPickedAvatar] = useState<{ uri: string; type?: string; fileName?: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const countries = useReferenceDataStore(state => state.countries);
  const provincesByCountry = useReferenceDataStore(state => state.provincesByCountry);
  const citiesByProvince = useReferenceDataStore(state => state.citiesByProvince);

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
      fullName: profile?.full_name ?? '',
      phone: profile?.phone ?? null,
      countryId: profile?.country_id ?? null,
      provinceId: profile?.province_id ?? null,
      cityId: profile?.city_id ?? null,
      village: profile?.village ?? '',
      street: profile?.street ?? '',
      experience: '',
      agriculturalInfo: '',
    },
  });

  useEffect(() => {
    if (!userId || profile?.role !== 'farmer') return;
    fetchFarmerProfile().then(farmerProfile => {
      if (farmerProfile) {
        reset(current => ({
          ...current,
          experience: farmerProfile.experience ?? '',
          agriculturalInfo: farmerProfile.agricultural_info ?? '',
        }));
      }
    }).catch(err => {
      console.warn('[EditProfileScreen] failed to load farmer profile:', err);
    });
  }, [userId, profile?.role, reset]);

  const countryId = watch('countryId');
  const provinceId = watch('provinceId');
  const cityId = watch('cityId');

  const provinceOptions = useMemo(
    () => (countryId ? (provincesByCountry[countryId] ?? []) : []),
    [countryId, provincesByCountry],
  );
  const cityOptions = useMemo(
    () => (provinceId ? (citiesByProvince[provinceId] ?? []) : []),
    [provinceId, citiesByProvince],
  );

  const pickAvatar = async () => {
    const result = await launchImageLibrary({ mediaType: 'photo', selectionLimit: 1 });
    const asset = result.assets?.[0];
    if (asset?.uri) {
      setAvatarUri(asset.uri);
      setPickedAvatar({ uri: asset.uri, type: asset.type, fileName: asset.fileName });
    }
  };

  const onSubmit = async (values: EditProfileFormValues) => {
    if (!userId) return;
    setSubmitting(true);
    try {
      let avatarUrl = profile?.avatar_url ?? null;
      if (pickedAvatar) {
        avatarUrl = await uploadAvatar(userId, pickedAvatar);
      }

      const countryName = countries.find(c => c.id === values.countryId)?.name;
      const provinceName = provinceOptions.find(p => p.id === values.provinceId)?.name;
      const cityName = cityOptions.find(c => c.id === values.cityId)?.name;
      const location = [values.village, cityName, provinceName, countryName].filter(Boolean).join(', ') || null;

      await updateProfile({
        full_name: values.fullName,
        phone: values.phone,
        location,
        country_id: values.countryId,
        province_id: values.provinceId,
        city_id: values.cityId,
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
      Alert.alert('Failed to update profile', error instanceof Error ? error.message : String(error));
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
          <Avatar name={profile?.full_name} size={88} />
        )}
        <View style={styles.avatarBadge} />
      </TouchableOpacity>

      <Controller
        control={control}
        name="fullName"
        render={({ field: { onChange, onBlur, value } }) => (
          <Input
            label={t('profile.fullName')}
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
            label={t('profile.phone')}
            value={value}
            onChange={onChange}
            error={errors.phone?.message}
          />
        )}
      />
      <LocationPicker
        countryId={countryId}
        provinceId={provinceId}
        cityId={cityId}
        onCountryChange={id => setValue('countryId', id)}
        onProvinceChange={id => setValue('provinceId', id)}
        onCityChange={id => setValue('cityId', id)}
        labels={{ country: t('profile.country'), province: t('profile.province'), city: t('profile.city') }}
      />
      <Controller
        control={control}
        name="village"
        render={({ field: { onChange, onBlur, value } }) => (
          <Input label={t('profile.village')} value={value} onChangeText={onChange} onBlur={onBlur} />
        )}
      />
      <Controller
        control={control}
        name="street"
        render={({ field: { onChange, onBlur, value } }) => (
          <Input label={t('profile.street')} value={value} onChangeText={onChange} onBlur={onBlur} />
        )}
      />

      {profile?.role === 'farmer' ? (
        <>
          <Controller
            control={control}
            name="experience"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
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
              <Input
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
        label={t('profile.saveChanges')}
        loading={submitting}
        onPress={handleSubmit(onSubmit)}
        style={styles.submit}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: lightTheme.colors.neutral.white,
  },
  content: {
    padding: spacing.lg,
  },
  avatarWrap: {
    alignSelf: 'center',
    marginBottom: spacing.xl,
  },
  avatarImage: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: lightTheme.colors.neutral.gray100,
  },
  avatarBadge: {},
  submit: {
    marginTop: spacing.md,
  },
});
