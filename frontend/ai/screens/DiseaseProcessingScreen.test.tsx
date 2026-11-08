import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderWithQuery } from '../../testUtils/renderWithProviders';
import { DiseaseProcessingScreen } from './DiseaseProcessingScreen';
import { failureCause } from '../hooks/disease';
import { createDiseaseCase, predictDisease, uploadDiseaseImage } from '../services/diseaseService';
import { CONSULTATIONS_ROUTES, APP_TABS } from '../../common/constants/routes';
import { ApiError } from '../../services/api/client';
import { useAuthStore } from '../../state/authStore';

const mockReplace = jest.fn();
const mockGoBack = jest.fn();
const mockTabNavigate = jest.fn();
let mockRouteParams: Record<string, unknown> = {};

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({ replace: mockReplace, goBack: mockGoBack }),
    useRoute: () => ({ params: mockRouteParams }),
  };
});

jest.mock('../../navigation/stacks/useAppTabNavigation', () => ({
  useAppTabNavigation: () => ({ navigate: mockTabNavigate }),
}));

jest.mock('../services/diseaseService', () => ({
  createDiseaseCase: jest.fn(),
  predictDisease: jest.fn(),
  uploadDiseaseImage: jest.fn(),
}));

const mockUpload = uploadDiseaseImage as jest.Mock;
const mockCreateCase = createDiseaseCase as jest.Mock;
const mockPredict = predictDisease as jest.Mock;

const apiError = (status: number, kind: ApiError['kind'], code: ApiError['code'] = 'unknown') =>
  new ApiError({ status, kind, code, message: 'x' });

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ user: { id: 'farmer-1' } as never });
  mockRouteParams = {
    imageUri: 'file://leaf.jpg',
    imageFileName: 'leaf.jpg',
    imageType: 'image/jpeg',
    cropId: 'crop-1',
    cropKey: 'tomato',
    cropName: 'Tomato',
  };
});

describe('failureCause', () => {
  it.each([
    [apiError(422, 'validation', 'validation_failed'), 'photo'],
    [apiError(0, 'network', 'network'), 'offline'],
    [apiError(0, 'timeout', 'timeout'), 'offline'],
    [apiError(503, 'server', 'service_unavailable'), 'unavailable'],
    [apiError(429, 'rateLimited', 'rate_limited'), 'other'],
    [new TypeError('Network request failed'), 'offline'],
    [new Error('quota exceeded'), 'other'],
  ])('reads %p as %s', (error, cause) => {
    expect(failureCause(error)).toBe(cause);
  });
});

describe('DiseaseProcessingScreen', () => {
  it('shows the two steps and a quiet Cancel while the check runs', async () => {
    mockUpload.mockReturnValue(new Promise(() => {}));
    await renderWithQuery(<DiseaseProcessingScreen />);
    expect(screen.getByText('Sending photo')).toBeTruthy();
    expect(screen.getByText('Checking the leaf')).toBeTruthy();

    await fireEvent.press(screen.getByText('Cancel'));
    expect(mockGoBack).toHaveBeenCalled();
  });

  it('uploads, creates a case, predicts with the chosen crop, and opens the result with the crop comparison', async () => {
    mockUpload.mockResolvedValue('farmer-1/leaf.jpg');
    mockCreateCase.mockResolvedValue({ id: 'case-1' });
    mockPredict.mockResolvedValue({ id: 'pred-1', crop_matches: true });
    await renderWithQuery(<DiseaseProcessingScreen />);

    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith('DiseaseResult', { diseaseCaseId: 'case-1', cropMatches: true, chosenCropName: 'Tomato' }),
    );
    expect(mockUpload).toHaveBeenCalledWith('farmer-1', { uri: 'file://leaf.jpg', fileName: 'leaf.jpg', mimeType: 'image/jpeg' });
    expect(mockCreateCase).toHaveBeenCalledWith('crop-1', 'farmer-1/leaf.jpg');
    expect(mockPredict).toHaveBeenCalledWith('case-1', 'tomato');
  });

  it('passes a different-crop answer to the result screen', async () => {
    mockUpload.mockResolvedValue('farmer-1/leaf.jpg');
    mockCreateCase.mockResolvedValue({ id: 'case-1' });
    mockPredict.mockResolvedValue({ id: 'pred-1', crop_matches: false });
    await renderWithQuery(<DiseaseProcessingScreen />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('DiseaseResult', expect.objectContaining({ cropMatches: false })));
  });

  it('says the photo could not be read and offers another photo', async () => {
    mockUpload.mockResolvedValue('farmer-1/leaf.jpg');
    mockCreateCase.mockResolvedValue({ id: 'case-1' });
    mockPredict.mockRejectedValue(apiError(422, 'validation', 'validation_failed'));
    await renderWithQuery(<DiseaseProcessingScreen />);

    expect(await screen.findByText("We couldn't read this photo")).toBeTruthy();
    await fireEvent.press(screen.getByText('Take another photo'));
    expect(mockGoBack).toHaveBeenCalled();
  });

  it('says there is no connection, keeps the photo and offers only to try again', async () => {
    mockUpload.mockRejectedValue(new TypeError('Network request failed'));
    await renderWithQuery(<DiseaseProcessingScreen />);

    expect(await screen.findByText('No connection')).toBeTruthy();
    expect(screen.getByText('Try again')).toBeTruthy();
    expect(screen.queryByText('Ask an expert')).toBeNull();
  });

  it('says the service is unavailable and still offers an expert', async () => {
    mockUpload.mockResolvedValue('farmer-1/leaf.jpg');
    mockCreateCase.mockResolvedValue({ id: 'case-1' });
    mockPredict.mockRejectedValue(apiError(503, 'server', 'service_unavailable'));
    await renderWithQuery(<DiseaseProcessingScreen />);

    expect(await screen.findByText('The plant check is not available right now')).toBeTruthy();
    expect(screen.getByText('Try again')).toBeTruthy();
    expect(screen.getByText('Ask an expert')).toBeTruthy();
  });

  it('reuses the photo and the case on retry instead of creating another case', async () => {
    mockUpload.mockResolvedValue('farmer-1/leaf.jpg');
    mockCreateCase.mockResolvedValue({ id: 'case-1' });
    mockPredict.mockRejectedValueOnce(apiError(503, 'server', 'service_unavailable'));
    await renderWithQuery(<DiseaseProcessingScreen />);
    await screen.findByText('The plant check is not available right now');

    mockPredict.mockResolvedValueOnce({ id: 'pred-1', crop_matches: true });
    await fireEvent.press(screen.getByText('Try again'));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('DiseaseResult', expect.objectContaining({ diseaseCaseId: 'case-1' })));
    expect(mockUpload).toHaveBeenCalledTimes(1);
    expect(mockCreateCase).toHaveBeenCalledTimes(1);
    expect(mockPredict).toHaveBeenCalledTimes(2);
  });

  it('hands off to an expert with the local photo, and never writes AI text into the problem', async () => {
    mockUpload.mockRejectedValue(apiError(500, 'server', 'server_error'));
    await renderWithQuery(<DiseaseProcessingScreen />);
    await screen.findByText('The plant check is not available right now');
    await fireEvent.press(screen.getByText('Ask an expert'));

    expect(mockTabNavigate).toHaveBeenCalledWith(APP_TABS.Consultations, {
      screen: CONSULTATIONS_ROUTES.ExpertList,
      initial: false,
      params: {
        specialization: 'plant_diseases',
        prefill: { subject: 'Sick tomato plant', problemDescription: '', cropId: 'crop-1', imageUrl: 'file://leaf.jpg' },
      },
    });
  });
});
