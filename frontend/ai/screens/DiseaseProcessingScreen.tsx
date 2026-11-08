import { useNavigation, useRoute } from '@react-navigation/native';
import { Check, Circle } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Banner, Button, ListGroup, ListRow, ScreenScaffold, Spinner } from '../../common/components';
import { useAppTabNavigation } from '../../navigation/stacks/useAppTabNavigation';
import { useAuthStore } from '../../state/authStore';
import { RoleScopeProvider, useTheme, type Theme } from '../../theme';
import { errorMessage } from '../../utils/errorMessage';
import { failureCause, useRunDiseaseAnalysis } from '../hooks/disease';
import { navigateToConsultExpert } from './expertHandoff';

interface RouteParams {
  imageUri: string;
  imageFileName: string | null;
  imageType: string | null;
  /** The shared crops table's row for the chosen crop, when it has one. */
  cropId: string | null;
  /** The chosen crop's key from GET /api/v1/disease/crops, sent to predict so the server can compare crops (D16). */
  cropKey: string | null;
  cropName: string | null;
}

// Only ever reached by Farmer — Disease Advisory is farmer-only (like Inventory is
// dealer-only), gated at the farmer home's "Is a crop sick?" card.
export function DiseaseProcessingScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { imageUri, imageFileName, imageType, cropId, cropKey, cropName } = useRoute().params as RouteParams;
  const navigation = useNavigation<any>();
  const tabs = useAppTabNavigation();
  const userId = useAuthStore(state => state.user?.id);
  const analysis = useRunDiseaseAnalysis();
  const { mutate: analyze } = analysis;

  const start = useCallback(() => {
    if (!userId) return;
    analyze(
      {
        userId,
        image: { uri: imageUri, fileName: imageFileName ?? undefined, mimeType: imageType ?? undefined },
        cropId,
        cropKey,
      },
      {
        onSuccess: ({ diseaseCaseId, prediction }) =>
          navigation.replace('DiseaseResult', { diseaseCaseId, cropMatches: prediction.crop_matches, chosenCropName: cropName }),
      },
    );
  }, [userId, imageUri, imageFileName, imageType, cropId, cropKey, cropName, navigation, analyze]);

  useEffect(() => {
    start();
    // Mount-only: the analysis starts once when the screen opens; a retry is the button below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cancel = () => navigation.goBack();
  const takeAnother = () => navigation.goBack();
  // The photo goes along from the device, whatever happened to the upload.
  const askExpert = () => navigateToConsultExpert(tabs, { cropId, cropName, imageUrl: imageUri });

  const failed = analysis.isError;
  const cause = failed ? failureCause(analysis.error) : null;
  const sending = analysis.stage === 'sending';

  return (
    <RoleScopeProvider scope="ai">
      <ScreenScaffold>
        {failed && cause === 'photo' ? (
          <Banner tone="warning" title="We couldn't read this photo">
            Photograph one leaf in daylight, close enough to fill the frame.
          </Banner>
        ) : null}
        {failed && cause === 'offline' ? (
          <Banner tone="offline" title="No connection">
            Check your internet, then try again. Your photo is kept.
          </Banner>
        ) : null}
        {failed && cause === 'unavailable' ? (
          <Banner tone="warning" title="The plant check is not available right now">
            Try again shortly, or ask an expert to look at your photo.
          </Banner>
        ) : null}
        {failed && cause === 'other' ? (
          <Banner tone="danger" title="The photo could not be checked">
            {errorMessage(analysis.error)}
          </Banner>
        ) : null}
        {analysis.isPaused ? (
          <Banner tone="offline" title="Waiting for a connection">
            We will check your photo as soon as you are back online.
          </Banner>
        ) : null}

        {failed ? (
          <View style={styles.actions}>
            {cause === 'photo' ? (
              <>
                <Button label="Take another photo" onPress={takeAnother} />
                <Button label="Ask an expert" variant="secondary" onPress={askExpert} />
              </>
            ) : (
              <>
                <Button label="Try again" onPress={start} />
                {cause === 'offline' ? null : <Button label="Ask an expert" variant="secondary" onPress={askExpert} />}
                <Button label="Cancel" variant="quiet" onPress={cancel} />
              </>
            )}
          </View>
        ) : (
          <>
            <ListGroup>
              <ListRow
                leading={sending ? <Spinner /> : <Check color={theme.colors.status.success.mark} size={theme.size.iconMd} />}
                title="Sending photo"
                meta={sending ? 'Working' : 'Done'}
              />
              <ListRow leading={sending ? <Circle color={theme.colors.ink3} size={theme.size.iconMd} /> : <Spinner />} title="Checking the leaf" meta={sending ? 'Next' : 'Working'} />
            </ListGroup>
            <Button label="Cancel" variant="quiet" onPress={cancel} />
          </>
        )}
      </ScreenScaffold>
    </RoleScopeProvider>
  );
}

function makeStyles({ space }: Theme) {
  return StyleSheet.create({
    actions: { gap: space[2] },
  });
}
