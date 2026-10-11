import React from 'react';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../testUtils/renderWithProviders';
import { DiseaseResultScreen } from './DiseaseResultScreen';
import { fetchDiseaseCaseWithPrediction } from '../services/diseaseService';
import { fetchListings } from '../../common/marketplace/services/listingsService';
import { APP_TABS, CONSULTATIONS_ROUTES, MARKETPLACE_ROUTES } from '../../common/constants/routes';
import type { DiseaseCaseWithPrediction, DiseaseReport } from '../types/disease';
import type { ListingWithRelations } from '../../common/marketplace/types/marketplace';

const mockNavigate = jest.fn();
const mockGetParent = jest.fn();
let mockRouteParams: Record<string, unknown> = { diseaseCaseId: 'case-1' };
// The latest focus effect, so a test can bring the screen back into focus.
let mockFocusEffect: (() => void) | null = null;

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  const { useEffect } = jest.requireActual('react');
  return {
    ...actual,
    useFocusEffect: (effect: () => void) => {
      mockFocusEffect = effect;
      return useEffect(() => {
        effect();
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
    },
    useNavigation: () => ({ navigate: mockNavigate, getParent: mockGetParent }),
    useRoute: () => ({ params: mockRouteParams }),
  };
});

jest.mock('../services/diseaseService', () => ({
  fetchDiseaseCaseWithPrediction: jest.fn(),
}));

jest.mock('../../common/marketplace/services/listingsService', () => ({
  fetchListings: jest.fn(),
}));

const mockFetchCase = fetchDiseaseCaseWithPrediction as jest.Mock;
const mockFetchListings = fetchListings as jest.Mock;

// The report as the backend builds it from the knowledge base (plan A6); the screen shows only this, never the stored
// prediction text.
const report = (overrides: Partial<DiseaseReport> = {}): DiseaseReport => ({
  predicted_disease: 'Wheat — Leaf rust',
  class_label: 'Wheat___Leaf_rust',
  crop: 'Wheat',
  disease: 'Leaf rust',
  confidence_score: 0.85,
  confidence_band: 'confident',
  is_healthy: false,
  symptoms: ['Orange pustules on leaves'],
  treatment: ['Apply fungicide', 'Remove infected leaves'],
  precautions: ['Rotate crops'],
  advisory: 'A fungal disease affecting wheat leaves.',
  review_status: 'reviewed',
  disclaimer: 'This is an AI suggestion, not a diagnosis. Confirm it with an agricultural expert before you treat your crop.',
  model_version: 'v1',
  created_at: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const diseaseCase = (overrides: Partial<DiseaseCaseWithPrediction> = {}): DiseaseCaseWithPrediction =>
  ({
    id: 'case-1',
    user_id: 'farmer-1',
    crop_id: 'crop-1',
    image_signed_url: 'https://example.com/leaf.jpg?token=signed',
    created_at: '2026-01-01T00:00:00.000Z',
    crop: { id: 'crop-1', name: 'Wheat' },
    status: 'predicted',
    failure_reason: null,
    prediction: {
      id: 'pred-1',
      disease_case_id: 'case-1',
      predicted_disease: 'Stored name (history only)',
      confidence_score: 0.85,
      description: 'Stored text (history only)',
      recommended_actions: [],
      model_version: 'v1',
      created_at: '2026-01-01T00:00:00.000Z',
    },
    report: report(),
    ...overrides,
  }) as DiseaseCaseWithPrediction;

beforeEach(() => {
  mockNavigate.mockReset();
  mockGetParent.mockReset();
  mockFetchCase.mockReset();
  mockFetchListings.mockReset().mockResolvedValue([]);
  mockRouteParams = { diseaseCaseId: 'case-1' };
});

describe('DiseaseResultScreen', () => {
  it('shows the predicted disease and confidence once loaded', async () => {
    mockFetchCase.mockResolvedValue(diseaseCase());
    await renderWithQuery(<DiseaseResultScreen />);

    expect(await screen.findByText('Wheat — Leaf rust')).toBeTruthy();
    expect(screen.getByText('85% confidence')).toBeTruthy();
    expect(screen.getByText(/Orange pustules/)).toBeTruthy();
    expect(screen.getByText(/Apply fungicide/)).toBeTruthy();
    expect(screen.getByText(/Rotate crops/)).toBeTruthy();
    expect(screen.getByText('A fungal disease affecting wheat leaves.')).toBeTruthy();
    // The stored prediction row is history; the screen reads the report.
    expect(screen.queryByText('Stored name (history only)')).toBeNull();
    // Reviewed text: no draft marker.
    expect(screen.queryByText('Draft, pending agronomist review')).toBeNull();
  });

  it('shows the disclaimer from the report on every result (BR-13)', async () => {
    mockFetchCase.mockResolvedValue(diseaseCase());
    await renderWithQuery(<DiseaseResultScreen />);
    expect(await screen.findByText(/This is an AI suggestion, not a diagnosis/)).toBeTruthy();
  });

  it('marks unreviewed knowledge text as a draft', async () => {
    const draft = report({
      review_status: 'pending_review',
      disclaimer: 'This is an AI suggestion, not a diagnosis. This advice has not yet been reviewed by an agricultural expert.',
    });
    mockFetchCase.mockResolvedValue(diseaseCase({ report: draft }));
    await renderWithQuery(<DiseaseResultScreen />);
    expect(await screen.findByText('Draft, pending agronomist review')).toBeTruthy();
    expect(screen.getByText('Pending agronomist review')).toBeTruthy();
    expect(screen.getByText(/has not yet been reviewed/)).toBeTruthy();
  });

  it('puts the expert route first when the confidence is low', async () => {
    mockFetchCase.mockResolvedValue(diseaseCase({ report: report({ confidence_score: 0.42, confidence_band: 'low' }) }));
    await renderWithQuery(<DiseaseResultScreen />);
    expect(await screen.findByText('Low confidence: ask an expert to check')).toBeTruthy();
    expect(screen.getByText('42% confidence')).toBeTruthy();
    expect(screen.getByLabelText('Low confidence, 42 percent')).toBeTruthy();
    // One Consult button, placed before the report lists.
    expect(screen.getAllByText('Consult an Expert')).toHaveLength(1);
  });

  it('shows preventive care, not symptoms, for a healthy crop, worded as an estimate (BR-13)', async () => {
    const healthy = report({
      predicted_disease: 'Wheat — Healthy',
      disease: 'Healthy',
      is_healthy: true,
      symptoms: ['should not show'],
      treatment: [],
      precautions: ['Keep inspecting weekly'],
    });
    mockFetchCase.mockResolvedValue(diseaseCase({ report: healthy }));
    await renderWithQuery(<DiseaseResultScreen />);
    expect(await screen.findByText('The AI found no sign of disease')).toBeTruthy();
    expect(
      screen.getByText(
        'This is an estimate from one photo, not a diagnosis. If the plant still looks unwell, ask an expert to check.',
      ),
    ).toBeTruthy();
    // Never a definite all-clear written by the app.
    expect(screen.queryByText(/looks healthy/)).toBeNull();
    expect(screen.getByText('Preventive care')).toBeTruthy();
    expect(screen.getByText(/Keep inspecting weekly/)).toBeTruthy();
    expect(screen.queryByText(/should not show/)).toBeNull();
    // The route to an expert stays visible for a healthy result too.
    expect(screen.getByText('Consult an Expert')).toBeTruthy();
  });

  it('shows a placeholder, and still the report, when the photo is no longer in storage', async () => {
    mockFetchCase.mockResolvedValue(diseaseCase({ image_signed_url: null }));
    await renderWithQuery(<DiseaseResultScreen />);
    expect(await screen.findByText('The photo is no longer available')).toBeTruthy();
    expect(screen.queryByLabelText('Your leaf photo')).toBeNull();
    expect(screen.getByText('Wheat — Leaf rust')).toBeTruthy();

    const tabNavigate = jest.fn();
    mockGetParent.mockReturnValue({ navigate: tabNavigate });
    await fireEvent.press(screen.getByText('Consult an Expert'));
    expect(tabNavigate.mock.calls[0][1].params.prefill.imageUrl).toBeNull();
  });

  it('fetches the case again when the screen regains focus, so an expired photo link is replaced', async () => {
    mockFetchCase.mockResolvedValue(diseaseCase());
    await renderWithQuery(<DiseaseResultScreen />);
    await screen.findByText('Wheat — Leaf rust');
    const callsBefore = mockFetchCase.mock.calls.length;

    // The link is signed for ten minutes; coming back to the screen must swap in a freshly signed one.
    const fresh = 'https://example.com/leaf.jpg?token=fresh';
    mockFetchCase.mockResolvedValue(diseaseCase({ image_signed_url: fresh }));
    await act(async () => {
      mockFocusEffect?.();
    });
    expect(mockFetchCase.mock.calls.length).toBe(callsBefore + 1);
    expect(mockFetchCase).toHaveBeenLastCalledWith('case-1');
    await screen.findByLabelText('Your leaf photo');
    expect(screen.getByLabelText('Your leaf photo').props.source).toEqual({ uri: fresh });
  });

  it('says the photo could not be analysed when the case failed', async () => {
    mockFetchCase.mockResolvedValue(
      diseaseCase({ status: 'failed', failure_reason: 'model_unavailable', prediction: null, report: null }),
    );
    await renderWithQuery(<DiseaseResultScreen />);
    expect(await screen.findByText('This photo could not be analysed. An expert can still look at it.')).toBeTruthy();
    expect(screen.getByText('Consult an Expert')).toBeTruthy();
  });

  it("shows a retryable error state when loading fails", async () => {
    mockFetchCase.mockRejectedValueOnce(new Error('offline'));
    await renderWithQuery(<DiseaseResultScreen />);
    expect(await screen.findByText("Couldn't load this result")).toBeTruthy();

    mockFetchCase.mockResolvedValueOnce(diseaseCase());
    await fireEvent.press(screen.getByText('Retry'));
    expect(await screen.findByText('Wheat — Leaf rust')).toBeTruthy();
  });

  it('shows a fallback message when no prediction is available yet', async () => {
    mockFetchCase.mockResolvedValue(diseaseCase({ status: 'pending', prediction: null, report: null }));
    await renderWithQuery(<DiseaseResultScreen />);
    expect(await screen.findByText('No prediction is available for this case.')).toBeTruthy();
  });

  it('loads and lists related marketplace listings for the predicted crop', async () => {
    mockFetchCase.mockResolvedValue(diseaseCase());
    const listing = { id: 'listing-1', title: 'Fungicide Spray', price: 1200, unit: 'bottle' } as ListingWithRelations;
    mockFetchListings.mockResolvedValue([listing]);
    await renderWithQuery(<DiseaseResultScreen />);

    expect(await screen.findByText('Fungicide Spray')).toBeTruthy();
    expect(mockFetchListings).toHaveBeenCalledWith({ cropName: 'Wheat' });

    const tabNavigate = jest.fn();
    mockGetParent.mockReturnValue({ navigate: tabNavigate });
    await fireEvent.press(screen.getByText('Fungicide Spray'));
    expect(tabNavigate).toHaveBeenCalledWith(APP_TABS.Marketplace, {
      screen: MARKETPLACE_ROUTES.ListingDetail,
      params: { listingId: 'listing-1' },
    });
  });

  it('navigates to Consult an Expert with the report context and links the case', async () => {
    mockFetchCase.mockResolvedValue(diseaseCase());
    const tabNavigate = jest.fn();
    mockGetParent.mockReturnValue({ navigate: tabNavigate });
    await renderWithQuery(<DiseaseResultScreen />);
    await screen.findByText('Wheat — Leaf rust');

    await fireEvent.press(screen.getByText('Consult an Expert'));
    expect(tabNavigate).toHaveBeenCalledWith(APP_TABS.Consultations, {
      screen: CONSULTATIONS_ROUTES.ExpertList,
      params: {
        specialization: 'plant_diseases',
        prefill: {
          // No problemDescription: the AI's advisory is never put forward as the farmer's own words (BR-13).
          subject: 'Disease advisory: Wheat — Leaf rust',
          cropId: 'crop-1',
          imageUrl: 'https://example.com/leaf.jpg?token=signed',
          // The consultation is linked to the case, so the assigned expert sees the photo and the report.
          diseaseCaseId: 'case-1',
        },
      },
    });
  });
});
