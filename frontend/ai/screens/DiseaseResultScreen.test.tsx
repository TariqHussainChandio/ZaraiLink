import React from 'react';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../testUtils/renderWithProviders';
import { DiseaseResultScreen } from './DiseaseResultScreen';
import { fetchDiseaseCaseWithPrediction } from '../services/diseaseService';
import { APP_TABS, CONSULTATIONS_ROUTES, HOME_ROUTES } from '../../common/constants/routes';
import type { DiseaseCaseWithPrediction, DiseaseReport } from '../types/disease';

const mockNavigate = jest.fn();
const mockTabNavigate = jest.fn();
let mockRouteParams: Record<string, unknown> = {};
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
    useNavigation: () => ({ navigate: mockNavigate }),
    useRoute: () => ({ params: mockRouteParams }),
  };
});

jest.mock('../../navigation/stacks/useAppTabNavigation', () => ({
  useAppTabNavigation: () => ({ navigate: mockTabNavigate }),
}));

jest.mock('../services/diseaseService', () => ({
  fetchDiseaseCaseWithPrediction: jest.fn(),
}));

const mockFetchCase = fetchDiseaseCaseWithPrediction as jest.Mock;

// The report as the backend builds it from the knowledge base (plan A6); the screen shows only this, never the stored
// prediction text.
const report = (overrides: Partial<DiseaseReport> = {}): DiseaseReport => ({
  predicted_disease: 'Tomato — Late blight',
  class_label: 'Tomato___Late_blight',
  crop: 'Tomato',
  disease: 'Late blight',
  confidence_score: 0.78,
  confidence_band: 'confident',
  is_healthy: false,
  symptoms: ['Dark patches on leaves'],
  treatment: ['Remove affected leaves', 'Water at the base of the plant'],
  precautions: ['Avoid overhead irrigation'],
  advisory: 'The leaf pattern may indicate late blight.',
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
    crop: { id: 'crop-1', name: 'Tomato' },
    status: 'predicted',
    failure_reason: null,
    prediction: {
      id: 'pred-1',
      disease_case_id: 'case-1',
      predicted_disease: 'Stored name (history only)',
      confidence_score: 0.78,
      description: 'Stored text (history only)',
      recommended_actions: [],
      model_version: 'v1',
      created_at: '2026-01-01T00:00:00.000Z',
    },
    report: report(),
    ...overrides,
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
    // The stored prediction row is history; the screen reads the report.
    expect(screen.queryByText('Stored name (history only)')).toBeNull();
  });

  it('shows the report from the knowledge base: symptoms, what to do, precautions and the advisory', async () => {
    mockFetchCase.mockResolvedValue(diseaseCase());
    await renderWithQuery(<DiseaseResultScreen />);

    expect(await screen.findByText(/Dark patches on leaves/)).toBeTruthy();
    expect(screen.getByText('What to do now')).toBeTruthy();
    expect(screen.getByText(/Remove affected leaves/)).toBeTruthy();
    expect(screen.getByText(/Avoid overhead irrigation/)).toBeTruthy();
    expect(screen.getByText('The leaf pattern may indicate late blight.')).toBeTruthy();
    // Reviewed text: no draft marker.
    expect(screen.queryByText('Draft advice, not yet checked')).toBeNull();
    expect(screen.queryByText(/pending agronomist review/i)).toBeNull();
  });

  it('shows the disclaimer from the report on every result (BR-13)', async () => {
    mockFetchCase.mockResolvedValue(diseaseCase());
    await renderWithQuery(<DiseaseResultScreen />);
    expect(await screen.findByText(/This is an AI suggestion, not a diagnosis/)).toBeTruthy();
  });

  it('marks unreviewed knowledge text as a draft, saying "pending agronomist review" only once (A8)', async () => {
    const draft = report({
      review_status: 'pending_review',
      disclaimer: 'This is an AI suggestion, not a diagnosis. This advice has not yet been reviewed by an agricultural expert.',
    });
    mockFetchCase.mockResolvedValue(diseaseCase({ report: draft }));
    await renderWithQuery(<DiseaseResultScreen />);
    expect(await screen.findByText('Draft advice, not yet checked')).toBeTruthy();
    expect(screen.getAllByText(/pending agronomist review/i)).toHaveLength(1);
    expect(screen.getByText(/has not yet been reviewed/)).toBeTruthy();
  });

  it('says when the scan is not sure, from the backend band, and keeps the expert action', async () => {
    mockFetchCase.mockResolvedValue(diseaseCase({ report: report({ confidence_score: 0.42, confidence_band: 'low' }) }));
    await renderWithQuery(<DiseaseResultScreen />);
    expect(await screen.findByText('Low confidence: ask an expert to check')).toBeTruthy();
    expect(screen.getByText('Not sure')).toBeTruthy();
    expect(screen.getByLabelText('Not sure, 42 percent match')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Ask an expert' })).toHaveLength(1);
  });

  it('shows preventive care, not symptoms, for a healthy crop, worded as an estimate (BR-13)', async () => {
    const healthy = report({
      predicted_disease: 'Tomato — Healthy',
      disease: 'Healthy',
      is_healthy: true,
      symptoms: ['should not show'],
      treatment: [],
      precautions: ['Keep inspecting weekly'],
    });
    mockFetchCase.mockResolvedValue(diseaseCase({ report: healthy }));
    await renderWithQuery(<DiseaseResultScreen />);
    expect(await screen.findByText('The AI found no sign of disease')).toBeTruthy();
    expect(screen.getByText('Healthy leaf')).toBeTruthy();
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
    expect(screen.getByRole('button', { name: 'Ask an expert' })).toBeTruthy();
  });

  it('shows the advisory and the expert action instead of a report when the photo is another crop (D16)', async () => {
    mockRouteParams = { diseaseCaseId: 'case-1', cropMatches: false, chosenCropName: 'Potato' };
    mockFetchCase.mockResolvedValue(diseaseCase());
    await renderWithQuery(<DiseaseResultScreen />);

    expect(await screen.findByText('This does not look like potato')).toBeTruthy();
    expect(screen.queryByText('Late blight')).toBeNull();
    expect(screen.queryByText('What to do now')).toBeNull();
    expect(screen.queryByText(/% match/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Ask an expert' })).toBeTruthy();
  });

  it('shows a placeholder, and still the report, when the photo is no longer in storage', async () => {
    mockFetchCase.mockResolvedValue(diseaseCase({ image_signed_url: null }));
    await renderWithQuery(<DiseaseResultScreen />);
    expect(await screen.findByText('The photo is no longer available')).toBeTruthy();
    expect(screen.queryByLabelText('Your leaf photo')).toBeNull();
    expect(screen.getByText('Late blight')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Ask an expert' }));
    expect(mockTabNavigate.mock.calls[0][1].params.prefill.imageUrl).toBeNull();
  });

  it('fetches the case again when the screen regains focus, so an expired photo link is replaced', async () => {
    mockFetchCase.mockResolvedValue(diseaseCase());
    await renderWithQuery(<DiseaseResultScreen />);
    await screen.findByText('Late blight');
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
    expect(screen.getByRole('button', { name: 'Ask an expert' })).toBeTruthy();
  });

  it('shows a retryable error state when loading fails', async () => {
    mockFetchCase.mockRejectedValueOnce(new Error('offline'));
    await renderWithQuery(<DiseaseResultScreen />);
    expect(await screen.findByText("Couldn't load this result")).toBeTruthy();

    mockFetchCase.mockResolvedValueOnce(diseaseCase());
    await fireEvent.press(screen.getByText('Retry'));
    expect(await screen.findByText('Late blight')).toBeTruthy();
  });

  it('shows a fallback message when no prediction is available yet', async () => {
    mockFetchCase.mockResolvedValue(diseaseCase({ status: 'pending', prediction: null, report: null }));
    await renderWithQuery(<DiseaseResultScreen />);
    expect(await screen.findByText('No prediction is available for this case.')).toBeTruthy();
  });

  it('has no related products', async () => {
    mockFetchCase.mockResolvedValue(diseaseCase());
    await renderWithQuery(<DiseaseResultScreen />);
    await screen.findByText('Late blight');
    expect(screen.queryByText(/related products/i)).toBeNull();
  });

  it('asks an expert through the Consultations tab with the case id and without the AI text', async () => {
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
          subject: 'Disease advisory: Tomato — Late blight',
          // The AI's advisory is never put forward as the farmer's own words (BR-13, FA-09).
          problemDescription: '',
          cropId: 'crop-1',
          imageUrl: 'https://example.com/leaf.jpg?token=signed',
          // The consultation is linked to the case, so the assigned expert sees the photo and the report.
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
});
