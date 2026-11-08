import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { AppTabParamList } from '../../navigation/stacks/AppNavigator';
import { navigateInTab } from '../../navigation/navigateInTab';
import { APP_TABS, CONSULTATIONS_ROUTES } from '../../common/constants/routes';

interface HandoffContext {
  /** The matching row of the shared crops table, when the chosen crop has one (null otherwise). */
  cropId: string | null;
  cropName?: string | null;
  imageUrl: string | null;
  /** The scan's case, when one exists: the expert reads the AI suggestion from it as a block of its own. */
  diseaseCaseId?: string;
}

/**
 * Opens the expert list in the Advisory tab with the photo and crop of a scan. Goes through `navigateInTab` so the tab's
 * first screen stays underneath and Back works (FA-02). The farmer's problem field is left empty: the AI's description
 * is never written into it (FA-09, BR-13). The case id travels as `prefill.diseaseCaseId`, so the consultation can
 * attach the AI suggestion as its own block next to what the farmer says.
 *
 * Works after a scan, from the processing screen's failure state, and before a scan for a crop the model does not know.
 */
export function navigateToConsultExpert(
  tabs: BottomTabNavigationProp<AppTabParamList> | null | undefined,
  context: HandoffContext,
): void {
  navigateInTab(tabs, APP_TABS.Consultations, CONSULTATIONS_ROUTES.ExpertList, {
    specialization: 'plant_diseases',
    prefill: {
      subject: context.cropName ? `Sick ${context.cropName.toLowerCase()} plant` : 'Sick plant',
      problemDescription: '',
      cropId: context.cropId,
      imageUrl: context.imageUrl,
      ...(context.diseaseCaseId ? { diseaseCaseId: context.diseaseCaseId } : {}),
    },
  });
}
