import { APP_TABS, CONSULTATIONS_ROUTES } from '../../constants/routes';

interface HandoffContext {
  cropId: string | null;
  imageUrl: string | null;
  predictedDisease?: string;
  description?: string | null;
}

/**
 * Cross-tab handoff into the requester-side Consultations stack, same pattern
 * `ConsultationDetailScreen` already uses for its "Recommended" listing tap-through
 * (`navigation.getParent()?.navigate(...)`). Callers of this are always Farmer — Disease
 * Advisory itself is farmer-only, and Farmer's nav tree includes a Consultations tab. Works
 * both after a successful prediction and from the Processing screen's failure state (where
 * there's no prediction yet, just the uploaded photo/crop).
 */
export function navigateToConsultExpert(
  navigation: { getParent?: () => { navigate: (tab: string, params: unknown) => void } | undefined },
  context: HandoffContext,
): void {
  navigation.getParent?.()?.navigate(APP_TABS.Consultations, {
    screen: CONSULTATIONS_ROUTES.ExpertList,
    params: {
      specialization: 'plant_diseases',
      prefill: {
        subject: context.predictedDisease ? `Disease advisory: ${context.predictedDisease}` : 'Crop disease advisory',
        problemDescription: context.description ?? '',
        cropId: context.cropId,
        imageUrl: context.imageUrl,
      },
    },
  });
}
