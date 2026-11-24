// Hands a scan over to an expert: opens the expert list with the photo and crop prefilled.
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { AppTabParamList } from '../../navigation/stacks/AppNavigator';
import { navigateInTab } from '../../navigation/navigateInTab';
import { APP_TABS, CONSULTATIONS_ROUTES } from '../../common/constants/routes';
import type { DiseasePrefill } from '../types/disease';

// What the scan passes on to the consultation request.
interface HandoffContext {
  /** The matching row of the shared crops table, when the chosen crop has one (null otherwise). */
  cropId: string | null;
  cropName?: string | null;
  imageUrl: string | null;
  predictedDisease?: string;
  /** The recorded case, when one exists: the consultation is linked to it (`disease_case_id`); the expert reads the AI
   * suggestion from it as a block of its own. */
  diseaseCaseId?: string | null;
}

/**
 * Opens the expert list in the Consultations tab with the photo and crop of a scan. Goes through `navigateInTab` so the
 * tab's first screen stays underneath and Back works (FA-02). The farmer's problem field is left empty: the AI's
 * description is never written into it (FA-09, BR-13); the case id travels as `prefill.diseaseCaseId`, so the
 * consultation is linked to the case (A6).
 *
 * Works after a scan, from the processing screen's failure state (a case only if it was recorded before the failure),
 * and before a scan for a crop the model does not know. Callers are always farmers: Disease Advisory is farmer-only.
 */
export function navigateToConsultExpert(
  tabs: BottomTabNavigationProp<AppTabParamList> | null | undefined,
  context: HandoffContext,
): void {
  let subject = 'Sick plant';
  if (context.predictedDisease) subject = `Disease advisory: ${context.predictedDisease}`;
  else if (context.cropName) subject = `Sick ${context.cropName.toLowerCase()} plant`;
  const prefill: DiseasePrefill = {
    subject,
    problemDescription: '',
    cropId: context.cropId,
    imageUrl: context.imageUrl,
    // Only set when a case exists: a consultation can still be requested when the upload itself failed.
    ...(context.diseaseCaseId ? { diseaseCaseId: context.diseaseCaseId } : {}),
  };
  navigateInTab(tabs, APP_TABS.Consultations, CONSULTATIONS_ROUTES.ExpertList, {
    specialization: 'plant_diseases',
    prefill,
  });
}
