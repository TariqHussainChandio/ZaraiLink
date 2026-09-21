import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import '../../localization';
import { DiseaseProcessingScreen } from './DiseaseProcessingScreen';
import { createDiseaseCase, predictDisease, uploadDiseaseImage } from '../../services/modules/ai/diseaseService';
import { CONSULTATIONS_ROUTES, APP_TABS } from '../../constants/routes';
import { useAuthStore } from '../../store/authStore';

const mockReplace = jest.fn();
const mockGetParent = jest.fn();
let mockRouteParams: Record<string, unknown> = {};

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({ replace: mockReplace, getParent: mockGetParent }),
    useRoute: () => ({ params: mockRouteParams }),
  };
});

jest.mock('../../services/modules/ai/diseaseService', () => ({
  createDiseaseCase: jest.fn(),
  predictDisease: jest.fn(),
  uploadDiseaseImage: jest.fn(),
}));

const mockUploadDiseaseImage = uploadDiseaseImage as jest.Mock;
const mockCreateDiseaseCase = createDiseaseCase as jest.Mock;
const mockPredictDisease = predictDisease as jest.Mock;

beforeEach(() => {
  mockReplace.mockReset();
  mockGetParent.mockReset();
  mockUploadDiseaseImage.mockReset();
  mockCreateDiseaseCase.mockReset();
  mockPredictDisease.mockReset();
  useAuthStore.setState({ user: { id: 'farmer-1' } as never });
  mockRouteParams = {
    imageUri: 'file://leaf.jpg',
    imageFileName: 'leaf.jpg',
    imageType: 'image/jpeg',
    cropId: 'crop-1',
  };
});

describe('DiseaseProcessingScreen', () => {
  it('shows the analyzing spinner while the pipeline runs', async () => {
    mockUploadDiseaseImage.mockReturnValue(new Promise(() => {}));
    await render(<DiseaseProcessingScreen />);
    expect(screen.getByText('Analyzing your photo...')).toBeTruthy();
  });

  it('uploads the image, creates a case, predicts, and navigates to the result', async () => {
    mockUploadDiseaseImage.mockResolvedValue('https://example.com/leaf.jpg');
    mockCreateDiseaseCase.mockResolvedValue({ id: 'case-1' });
    mockPredictDisease.mockResolvedValue({ id: 'pred-1' });
    await render(<DiseaseProcessingScreen />);

    await screen.findByText('Analyzing your photo...');
    expect(mockUploadDiseaseImage).toHaveBeenCalledWith('farmer-1', {
      uri: 'file://leaf.jpg',
      fileName: 'leaf.jpg',
      type: 'image/jpeg',
    });

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('DiseaseResult', { diseaseCaseId: 'case-1' }));
    expect(mockCreateDiseaseCase).toHaveBeenCalledWith('crop-1', 'https://example.com/leaf.jpg');
    expect(mockPredictDisease).toHaveBeenCalledWith('case-1');
  });

  it('shows an error and lets the farmer retry when the pipeline fails', async () => {
    mockUploadDiseaseImage.mockRejectedValueOnce(new Error('Upload failed'));
    await render(<DiseaseProcessingScreen />);

    expect(await screen.findByText("AI analysis isn't available right now")).toBeTruthy();
    expect(screen.getByText('Upload failed')).toBeTruthy();

    mockUploadDiseaseImage.mockResolvedValueOnce('https://example.com/leaf.jpg');
    mockCreateDiseaseCase.mockResolvedValueOnce({ id: 'case-1' });
    mockPredictDisease.mockResolvedValueOnce({ id: 'pred-1' });
    await fireEvent.press(screen.getByText('Retry'));

    expect(await screen.findByText('Analyzing your photo...')).toBeTruthy();
  });

  it('hands off to Consult an Expert with the disease context on failure', async () => {
    mockUploadDiseaseImage.mockRejectedValue(new Error('AI service unavailable'));
    const tabNavigate = jest.fn();
    mockGetParent.mockReturnValue({ navigate: tabNavigate });
    await render(<DiseaseProcessingScreen />);

    await screen.findByText("AI analysis isn't available right now");
    await fireEvent.press(screen.getByText('Talk to an Expert'));

    expect(tabNavigate).toHaveBeenCalledWith(APP_TABS.Consultations, {
      screen: CONSULTATIONS_ROUTES.ExpertList,
      params: {
        specialization: 'plant_diseases',
        prefill: {
          subject: 'Crop disease advisory',
          problemDescription: '',
          cropId: 'crop-1',
          imageUrl: null,
        },
      },
    });
  });
});
