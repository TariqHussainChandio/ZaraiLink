import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../testUtils/renderWithProviders';
import { DiseaseResultScreen } from './DiseaseResultScreen';
import { fetchDiseaseCaseWithPrediction } from '../services/diseaseService';
import { fetchListings } from '../../common/marketplace/services/listingsService';
import { APP_TABS, CONSULTATIONS_ROUTES, MARKETPLACE_ROUTES } from '../../common/constants/routes';
import type { DiseaseCaseWithPrediction } from '../types/disease';
import type { ListingWithRelations } from '../../common/marketplace/types/marketplace';

const mockNavigate = jest.fn();
const mockGetParent = jest.fn();
let mockRouteParams: Record<string, unknown> = { diseaseCaseId: 'case-1' };

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  const { useEffect } = jest.requireActual('react');
  return {
    ...actual,
    useFocusEffect: (effect: () => void) =>
      useEffect(() => {
        effect();
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []),
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

const diseaseCase = (overrides: Partial<DiseaseCaseWithPrediction> = {}): DiseaseCaseWithPrediction =>
  ({
    id: 'case-1',
    user_id: 'farmer-1',
    crop_id: 'crop-1',
    image_signed_url: 'https://example.com/leaf.jpg?token=signed',
    created_at: '2026-01-01T00:00:00.000Z',
    crop: { id: 'crop-1', name: 'Wheat' },
    prediction: {
      id: 'pred-1',
      disease_case_id: 'case-1',
      predicted_disease: 'Wheat Rust',
      confidence_score: 0.85,
      description: 'A fungal disease affecting wheat leaves.',
      recommended_actions: ['Apply fungicide', 'Remove infected leaves'],
      model_version: 'v1',
      created_at: '2026-01-01T00:00:00.000Z',
    },
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

    expect(await screen.findByText('Wheat Rust')).toBeTruthy();
    expect(screen.getByText('85% confidence')).toBeTruthy();
    expect(screen.getByText(/Apply fungicide/)).toBeTruthy();
  });

  it("shows a retryable error state when loading fails", async () => {
    mockFetchCase.mockRejectedValueOnce(new Error('offline'));
    await renderWithQuery(<DiseaseResultScreen />);
    expect(await screen.findByText("Couldn't load this result")).toBeTruthy();

    mockFetchCase.mockResolvedValueOnce(diseaseCase());
    await fireEvent.press(screen.getByText('Retry'));
    expect(await screen.findByText('Wheat Rust')).toBeTruthy();
  });

  it('shows a fallback message when no prediction is available yet', async () => {
    mockFetchCase.mockResolvedValue(diseaseCase({ prediction: null }));
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

  it('navigates to Consult an Expert with the prediction context', async () => {
    mockFetchCase.mockResolvedValue(diseaseCase());
    const tabNavigate = jest.fn();
    mockGetParent.mockReturnValue({ navigate: tabNavigate });
    await renderWithQuery(<DiseaseResultScreen />);
    await screen.findByText('Wheat Rust');

    await fireEvent.press(screen.getByText('Consult an Expert'));
    expect(tabNavigate).toHaveBeenCalledWith(APP_TABS.Consultations, {
      screen: CONSULTATIONS_ROUTES.ExpertList,
      params: {
        specialization: 'plant_diseases',
        prefill: {
          subject: 'Disease advisory: Wheat Rust',
          problemDescription: 'A fungal disease affecting wheat leaves.',
          cropId: 'crop-1',
          imageUrl: 'https://example.com/leaf.jpg?token=signed',
        },
      },
    });
  });
});
