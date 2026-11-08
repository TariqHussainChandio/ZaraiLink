import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { Camera, Focus, Leaf, Sun } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { Image, Linking, StyleSheet, Text, View } from 'react-native';
import { Banner, Button, ListGroup, ListRow, ListRowIcon, ScreenScaffold, SelectField, StickyActionBar, useSnackbar } from '../../common/components';
import { useCrops } from '../../common/marketplace';
import { useAppTabNavigation } from '../../navigation/stacks/useAppTabNavigation';
import { RoleScopeProvider, useTheme, type Theme } from '../../theme';
import { errorMessage } from '../../utils/errorMessage';
import { pickFromLibrary, takePhoto, type PickedPhoto } from '../../utils/photoPicker';
import { useSupportedCrops } from '../hooks/disease';
import { navigateToConsultExpert } from './expertHandoff';

/** "tomato, potato and maize": the crops the scan checks, in a sentence. */
function sentenceList(names: string[]): string {
  const lower = names.map(name => name.toLowerCase());
  return lower.length < 2 ? lower.join('') : `${lower.slice(0, -1).join(', ')} and ${lower[lower.length - 1]}`;
}

// Registered in the shared `HomeNavigator` (Buyer/Farmer/Dealer's Home stack), but farmer-only
// in practice — reached from the farmer's home and the Advisory tab's scan action. The app bar
// already says "Check a sick plant", so the body does not repeat it (FA-08).
export function DiseaseUploadScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const navigation = useNavigation<any>();
  const tabs = useAppTabNavigation();
  const snackbar = useSnackbar();
  const { data: supported = [], isPending: loadingCrops, isError: cropsFailed, refetch } = useSupportedCrops();
  const { data: crops = [] } = useCrops();
  const [cropKey, setCropKey] = useState<string | null>(null);
  const [image, setImage] = useState<PickedPhoto | null>(null);
  const [cameraRefused, setCameraRefused] = useState(false);

  const chosen = supported.find(crop => crop.key === cropKey) ?? null;
  // The shared crops table has a row for a few of the model's crops (tomato, potato, maize); the case links to it when it does.
  const matchedCropId = chosen ? (crops.find(crop => crop.name.toLowerCase() === chosen.name.toLowerCase())?.id ?? null) : null;

  const onTakePhoto = async () => {
    try {
      const photos = await takePhoto();
      if (photos[0]) {
        setImage(photos[0]);
        setCameraRefused(false);
        return;
      }
      // An empty result is either backing out or a refusal; only a refusal needs the guidance below.
      const permission = await ImagePicker.getCameraPermissionsAsync();
      setCameraRefused(!permission.granted);
    } catch (error) {
      snackbar.show(errorMessage(error));
    }
  };

  const onChooseFromGallery = async () => {
    try {
      const photos = await pickFromLibrary({ selectionLimit: 1 });
      if (photos[0]) setImage(photos[0]);
    } catch (error) {
      snackbar.show(errorMessage(error));
    }
  };

  const askExpert = () => navigateToConsultExpert(tabs, { cropId: null, imageUrl: image?.uri ?? null });

  const check = () => {
    if (!image?.uri || !chosen) return;
    navigation.navigate('DiseaseProcessing', {
      imageUri: image.uri,
      imageFileName: image.fileName ?? null,
      imageType: image.mimeType ?? null,
      cropId: matchedCropId,
      cropKey: chosen.key,
      cropName: chosen.name,
    });
  };

  const footer = (
    <StickyActionBar>
      <View style={styles.actions}>
        {image ? (
          <>
            <Button label="Check this photo" size="lg" onPress={check} disabled={!chosen} />
            <Button label="Take a different photo" variant="quiet" onPress={() => setImage(null)} />
          </>
        ) : (
          <>
            <Button label="Take photo" size="lg" icon={Camera} onPress={onTakePhoto} />
            <Button label="Choose from gallery" variant="secondary" onPress={onChooseFromGallery} />
          </>
        )}
      </View>
    </StickyActionBar>
  );

  return (
    <RoleScopeProvider scope="ai">
      <ScreenScaffold footer={footer}>
        {cropsFailed ? (
          <Banner tone="warning" title="We couldn't load the crops we can check" actionLabel="Try again" onAction={() => refetch()}>
            Check your connection. You can still ask an expert about any crop.
          </Banner>
        ) : (
          <Banner tone="advisory" title="A suggestion, not a diagnosis" actionLabel="Other crops: Ask an expert" onAction={askExpert}>
            {supported.length > 0
              ? `We can check ${sentenceList(supported.map(crop => crop.name))}. For any other crop, ask an expert.`
              : 'We can check only some crops. For any other crop, ask an expert.'}
          </Banner>
        )}

        {cameraRefused ? (
          <Banner tone="warning" title="The camera is turned off" actionLabel="Open settings" onAction={() => Linking.openSettings()}>
            Allow the camera for ZaraiLink in settings, or choose a photo from your gallery.
          </Banner>
        ) : null}

        <SelectField
          label="Which crop is it?"
          placeholder="Choose the crop"
          value={cropKey}
          options={supported.map(crop => ({ id: crop.key, label: crop.name }))}
          onSelect={setCropKey}
          loading={loadingCrops}
        />

        {image?.uri ? (
          <View style={styles.previewBlock}>
            <Image source={{ uri: image.uri }} style={styles.preview} accessibilityLabel="Your leaf photo" accessibilityIgnoresInvertColors />
            {!chosen ? <Text style={styles.hint}>Choose the crop above to check this photo.</Text> : null}
          </View>
        ) : (
          <ListGroup>
            <ListRow leading={<ListRowIcon icon={Sun} />} title="Daylight" meta="No shadow on the leaf" />
            <ListRow leading={<ListRowIcon icon={Leaf} />} title="One leaf fills the frame" meta="Get close to the spots" />
            <ListRow leading={<ListRowIcon icon={Focus} />} title="Hold still" meta="Wait until it is sharp" />
          </ListGroup>
        )}
      </ScreenScaffold>
    </RoleScopeProvider>
  );
}

function makeStyles({ colors, space, radius, typography, size }: Theme) {
  return StyleSheet.create({
    actions: { gap: space[2] },
    previewBlock: { gap: space[2] },
    preview: { width: '100%', height: size.photoHero, borderRadius: radius.md, backgroundColor: colors.surfaceSunken },
    hint: { ...typography.body, color: colors.ink2 },
  });
}
