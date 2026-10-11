import { APP_TABS, CONSULTATIONS_ROUTES } from '../../common/constants/routes';
import type { DiseasePrefill } from '../types/disease';

interface HandoffContext {
  cropId: string | null;
  imageUrl: string | null;
  predictedDisease?: string;
  /** The recorded case, when one exists: the consultation is linked to it (`disease_case_id`). */
  diseaseCaseId?: string | null;
}

/**
 * Cross-tab handoff into the requester-side Consultations stack, same pattern
 * `ConsultationDetailScreen` already uses for its "Recommended" listing tap-through
 * (`navigation.getParent()?.navigate(...)`). Callers of this are always Farmer — Disease
 * Advisory itself is farmer-only, and Farmer's nav tree includes a Consultations tab. Works
 * both after a successful prediction and from the Processing screen's failure state (where
 * there's no prediction yet, just the uploaded photo/crop, and a case only if it was recorded
 * before the failure).
 */
export function navigateToConsultExpert(
  navigation: { getParent?: () => { navigate: (tab: string, params: unknown) => void } | undefined },
  context: HandoffContext,
): void {
  const prefill: DiseasePrefill = {
    subject: context.predictedDisease ? `Disease advisory: ${context.predictedDisease}` : 'Crop disease advisory',
    cropId: context.cropId,
    imageUrl: context.imageUrl,
    // Only set when a case exists: a consultation can still be requested when the upload itself failed.
    ...(context.diseaseCaseId ? { diseaseCaseId: context.diseaseCaseId } : {}),
  };
  navigation.getParent?.()?.navigate(APP_TABS.Consultations, {
    screen: CONSULTATIONS_ROUTES.ExpertList,
    params: { specialization: 'plant_diseases', prefill },
  });
}
