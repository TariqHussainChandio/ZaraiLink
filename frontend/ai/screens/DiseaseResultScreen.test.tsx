import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../testUtils/renderWithProviders';
import { DiseaseResultScreen } from './DiseaseResultScreen';
import { fetchDiseaseCaseWithPrediction } from '../services/diseaseService';
import { APP_TABS, CONSULTATIONS_ROUTES, HOME_ROUTES } from '../../common/constants/routes';
import type { DiseaseCaseWithPrediction } from '../types/disease';

const mockNavigate = jest.fn();
const mockTabNavigate = jest.fn();
let mockRouteParams: Record<string, unknown> = {};

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({ navigate: mockNavigate }),
    useRoute: () => ({ params: mockRouteParams }),
  };
});

jest.mock('../../navigation/stacks/useAppTabNavigation', () => ({
  useAppTabNavigation: () => ({ navigate: mockTabNavigate }),
}));

jest.mock('../services/diseaseService', () => ({ fetchDiseaseCaseWithPrediction: jest.fn() }));

const mockFetchCase = fetchDiseaseCaseWithPrediction as jest.Mock;

const diseaseCase = (prediction: Partial<NonNullable<DiseaseCaseWithPrediction['prediction']>> | null = {}): DiseaseCaseWithPrediction =>
  ({
    id: 'case-1',
    user_id: 'farmer-1',
    crop_id: 'crop-1',
    image_signed_url: 'https://example.com/leaf.jpg?token=signed',
    created_at: '2026-01-01T00:00:00.000Z',
    crop: { id: 'crop-1', name: 'Tomato' },
    prediction: prediction && {
      id: 'pred-1',
      disease_case_id: 'case-1',
      predicted_disease: 'Tomato — Late blight',
      confidence_score: 0.78,
      description: 'The leaf pattern may indicate late blight.',
      recommended_actions: ['Remove affected leaves', 'Water at the base of the plant'],
      model_version: 'v1',
      created_at: '2026-01-01T00:00:00.000Z',
      ...prediction,
    },
  }) as DiseaseCaseWithPrediction;

beforeEach(() => {
  jest.clearAllMocks();
  mockRouteParams = { diseaseCaseId: 'case-1', cropMatches: true, chosenCropName: 'Tomato' };
});

describe('DiseaseResultScreen', () => {
  it('leads with the advisory, then names the condition with confidence in words, the number and a bar', async () => {
    mockFetchCase.mockResolvedValue(diseaseCase());
    await renderWithQuery(<DiseaseResultScreen />);

    expect(await screen.findByText('Late blight')).toBeTruthy();
    expect(screen.getByText('A suggestion, not a diagnosis')).toBeTruthy();
    expect(screen.getByText('Tomato')).toBeTruthy();
    expect(screen.getByText('Likely')).toBeTruthy();
    expect(screen.getByText('The scan is fairly sure: 78% match')).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: '78 percent match' })).toBeTruthy();
  });

  it('lists what the scan found and what to do now', async () => {
    mockFetchCase.mockResolvedValue(diseaseCase());
    await renderWithQuery(<DiseaseResultScreen />);

    expect(await screen.findByText('What the scan found')).toBeTruthy();
    expect(screen.getByText('The leaf pattern may indicate late blight.')).toBeTruthy();
    expect(screen.getByText('What to do now')).toBeTruthy();
    expect(screen.getByText(/Remove affected leaves/)).toBeTruthy();
  });

  it('shows a warning and no treatment steps when the scan is not sure', async () => {
    mockFetchCase.mockResolvedValue(diseaseCase({ confidence_score: 0.4 }));
    await renderWithQuery(<DiseaseResultScreen />);

    expect(await screen.findByText('The scan is not sure')).toBeTruthy();
    expect(screen.getByText('Not sure')).toBeTruthy();
    expect(screen.queryByText('What to do now')).toBeNull();
    expect(screen.queryByText(/Remove affected leaves/)).toBeNull();
  });

  it('shows the advisory and the expert action instead of a report when the photo is another crop', async () => {
    mockRouteParams = { diseaseCaseId: 'case-1', cropMatches: false, chosenCropName: 'Potato' };
    mockFetchCase.mockResolvedValue(diseaseCase());
    await renderWithQuery(<DiseaseResultScreen />);

    expect(await screen.findByText('This does not look like potato')).toBeTruthy();
    expect(screen.queryByText('Late blight')).toBeNull();
    expect(screen.queryByText('What to do now')).toBeNull();
    expect(screen.queryByText(/% match/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Ask an expert' })).toBeTruthy();
  });

  it('has no related products', async () => {
    mockFetchCase.mockResolvedValue(diseaseCase());
    await renderWithQuery(<DiseaseResultScreen />);
    await screen.findByText('Late blight');
    expect(screen.queryByText(/related products/i)).toBeNull();
  });

  it('asks an expert through the Advisory tab with the case id and without the AI text', async () => {
    mockFetchCase.mockResolvedValue(diseaseCase());
    await renderWithQuery(<DiseaseResultScreen />);
    await screen.findByText('Late blight');

    await fireEvent.press(screen.getByRole('button', { name: 'Ask an expert' }));
    expect(mockTabNavigate).toHaveBeenCalledWith(APP_TABS.Consultations, {
      screen: CONSULTATIONS_ROUTES.ExpertList,
      initial: false,
      params: {
        specialization: 'plant_diseases',
        prefill: {
          subject: 'Sick tomato plant',
          problemDescription: '',
          cropId: 'crop-1',
          imageUrl: 'https://example.com/leaf.jpg?token=signed',
          diseaseCaseId: 'case-1',
        },
      },
    });
  });

  it('goes back to the scan start for another plant', async () => {
    mockFetchCase.mockResolvedValue(diseaseCase());
    await renderWithQuery(<DiseaseResultScreen />);
    await screen.findByText('Late blight');
    await fireEvent.press(screen.getByText('Scan another plant'));
    expect(mockNavigate).toHaveBeenCalledWith(HOME_ROUTES.DiseaseAdvisory);
  });

  it('shows a retryable error state when loading fails', async () => {
    mockFetchCase.mockRejectedValueOnce(new Error('offline'));
    await renderWithQuery(<DiseaseResultScreen />);
    expect(await screen.findByText("Couldn't load this result")).toBeTruthy();

    mockFetchCase.mockResolvedValueOnce(diseaseCase());
    await fireEvent.press(screen.getByText('Try again'));
    expect(await screen.findByText('Late blight')).toBeTruthy();
  });

  it('shows a fallback message when no prediction is available', async () => {
    mockFetchCase.mockResolvedValue(diseaseCase(null));
    await renderWithQuery(<DiseaseResultScreen />);
    expect(await screen.findByText('No prediction is available for this case.')).toBeTruthy();
  });
});
