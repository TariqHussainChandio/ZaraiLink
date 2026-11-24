// Screen to create a new listing with photos.
import { zodResolver } from '@hookform/resolvers/zod';
import type { NavigationAction } from '@react-navigation/native';
import React, { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Banner, Button, ConfirmSheet, FormCard, ScreenScaffold, useSnackbar } from '../../components';
import { ListingFormFields, listingFormDefaults, listingSchema, type ListingFormInput, type ListingFormValues } from '../components/ListingFormFields';
import { ListingPhotos, MAX_LISTING_PHOTOS } from '../components/ListingPhotos';
import { MARKETPLACE_ROUTES } from '../../constants/routes';
import { useCreateListing } from '../hooks/marketplace';
import { useAuthStore } from '../../../state/authStore';
import { pickPhotos, type PickedPhoto } from '../../../utils/photoPicker';
import type { MarketplaceScreenProps } from '../../../navigation/stacks/MarketplaceNavigator';
import { errorMessage } from '../../../utils/errorMessage';

const NO_PHOTO = 'Add at least one photo so buyers can see what you sell';

/** A new listing: photos first, then what it is, its price and quantity, where it is. Back from a half-filled form asks
 * before throwing it away; Publish ends on the new listing with "Listing published". */
export function CreateListingScreen({ navigation }: MarketplaceScreenProps<'CreateListing'>) {
  const userId = useAuthStore(state => state.user?.id);
  const profile = useAuthStore(state => state.profile);
  const snackbar = useSnackbar();
  const [images, setImages] = useState<PickedPhoto[]>([]);
  const [photoError, setPhotoError] = useState<string | undefined>();
  // A refused publish stays on the screen (and is announced) until the next try; an alert could be dismissed unread (A8).
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [discarding, setDiscarding] = useState<NavigationAction | null>(null);
  const createListing = useCreateListing();
  // Set once the listing is saved, so leaving the screen after Publish is not mistaken for abandoning the form.
  const done = useRef(false);

  const {
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isDirty },
  } = useForm<ListingFormInput, any, ListingFormValues>({
    resolver: zodResolver(listingSchema),
    // The seller's own place is the likeliest place of the goods, so the form starts with it.
    defaultValues: { ...listingFormDefaults, country: profile?.country ?? null, province: profile?.province ?? null, city: profile?.city ?? null },
  });

  const unsaved = isDirty || images.length > 0;
  useEffect(
    () =>
      navigation.addListener('beforeRemove', event => {
        if (done.current || !unsaved) return;
        event.preventDefault();
        setDiscarding(event.data.action);
      }),
    [navigation, unsaved],
  );

  // Picks photos from the camera or gallery and adds them.
  const pickImages = async () => {
    const assets = await pickPhotos({ selectionLimit: MAX_LISTING_PHOTOS - images.length });
    if (assets.length === 0) return;
    // Added to the photos already chosen, never instead of them: a camera adds one at a time.
    setImages(current => [...current, ...assets].slice(0, MAX_LISTING_PHOTOS));
    setPhotoError(undefined);
  };

  // Checks there is a photo, then saves the new listing.
  const onSubmit = async (values: ListingFormValues) => {
    if (!userId) return;
    if (images.length === 0) {
      setPhotoError(NO_PHOTO);
      return;
    }
    setSubmitError(null);
    try {
      const listing = await createListing.mutateAsync({
        userId,
        images,
        input: { ...values, description: values.description ?? '', brand: values.brand || null, condition: values.condition || null },
      });
      done.current = true;
      snackbar.show('Listing published');
      navigation.replace(MARKETPLACE_ROUTES.ListingDetail, { listingId: listing.id });
    } catch (error) {
      setSubmitError(errorMessage(error));
    }
  };

  // An invalid form still reports a missing photo, so every problem is on screen at once.
  const submit = () =>
    handleSubmit(onSubmit, () => {
      if (images.length === 0) setPhotoError(NO_PHOTO);
    })();

  return (
    <>
      {/* D20: the form is a centred card with its button at the end, as sign-up is. */}
      <ScreenScaffold centred>
        <FormCard>
          {submitError ? (
            <Banner tone="danger" title="Couldn't publish the listing">
              {submitError}
            </Banner>
          ) : null}
          <ListingPhotos
            uris={images.map(image => image.uri)}
            onAdd={pickImages}
            onRemove={index => setImages(current => current.filter((_, i) => i !== index))}
            error={photoError}
            disabled={createListing.isPending}
          />
          <ListingFormFields control={control} errors={errors} setValue={setValue} watch={watch} />
          <Button label="Publish listing" size="lg" loading={createListing.isPending} onPress={submit} />
        </FormCard>
      </ScreenScaffold>
      <ConfirmSheet
        visible={discarding !== null}
        onClose={() => setDiscarding(null)}
        title="Discard this listing?"
        message="What you have entered and the photos you chose will be lost."
        confirmLabel="Discard listing"
        keepLabel="Keep editing"
        destructive
        onConfirm={() => {
          const action = discarding;
          done.current = true;
          if (action) navigation.dispatch(action);
        }}
      />
    </>
  );
}
