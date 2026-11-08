import React from 'react';
import { Linking } from 'react-native';
import { fireEvent, screen } from '@testing-library/react-native';
import { getCameraPermissionsAsync } from 'expo-image-picker';
import { createTestQueryClient, renderWithQuery } from '../../testUtils/renderWithProviders';
import { queryKeys } from '../../hooks/keys';
import { APP_TABS, CONSULTATIONS_ROUTES } from '../../common/constants/routes';
import { DiseaseUploadScreen } from './DiseaseUploadScreen';
import { fetchSupportedCrops } from '../services/diseaseService';
import { pickFromLibrary, takePhoto } from '../../utils/photoPicker';
import type { Crop } from '../../common/marketplace/types/marketplace';

const mockNavigate = jest.fn();
const mockTabNavigate = jest.fn();

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return { ...actual, useNavigation: () => ({ navigate: mockNavigate }) };
});

jest.mock('../../navigation/stacks/useAppTabNavigation', () => ({
  useAppTabNavigation: () => ({ navigate: mockTabNavigate }),
}));

jest.mock('expo-image-picker', () => ({ getCameraPermissionsAsync: jest.fn() }));
jest.mock('../../utils/photoPicker', () => ({ takePhoto: jest.fn(), pickFromLibrary: jest.fn() }));
jest.mock('../services/diseaseService', () => ({ fetchSupportedCrops: jest.fn() }));

const mockTakePhoto = takePhoto as jest.Mock;
const mockPickFromLibrary = pickFromLibrary as jest.Mock;
const mockFetchSupportedCrops = fetchSupportedCrops as jest.Mock;
const mockPermission = getCameraPermissionsAsync as jest.Mock;

const supported = [
  { key: 'maize', name: 'Maize' },
  { key: 'tomato', name: 'Tomato' },
];
const crops: Crop[] = [{ id: 'crop-7', name: 'Tomato', category: null }];
const photo = { uri: 'file://leaf.jpg', fileName: 'leaf.jpg', mimeType: 'image/jpeg' };

let queryClient = createTestQueryClient();

beforeEach(() => {
  jest.clearAllMocks();
  queryClient = createTestQueryClient();
  queryClient.setQueryData(queryKeys.marketplace.crops(), crops);
  mockFetchSupportedCrops.mockResolvedValue(supported);
  mockPermission.mockResolvedValue({ granted: true });
});

async function chooseCrop(name: string) {
  await fireEvent.press(await screen.findByText('Choose the crop'));
  await fireEvent.press(await screen.findByText(name));
}

describe('DiseaseUploadScreen', () => {
  it('lists the crops the scan checks, offers only those, and does not repeat the app bar title', async () => {
    await renderWithQuery(<DiseaseUploadScreen />, queryClient);
    expect(await screen.findByText(/We can check maize and tomato/)).toBeTruthy();
    expect(screen.queryByText('Check a sick plant')).toBeNull();

    await fireEvent.press(screen.getByText('Choose the crop'));
    expect(screen.getByText('Maize')).toBeTruthy();
    expect(screen.getByText('Tomato')).toBeTruthy();
    expect(screen.queryByText('Wheat')).toBeNull();
  });

  it('shows the three photo tips and the two photo actions', async () => {
    await renderWithQuery(<DiseaseUploadScreen />, queryClient);
    expect(await screen.findByText('Daylight')).toBeTruthy();
    expect(screen.getByText('One leaf fills the frame')).toBeTruthy();
    expect(screen.getByText('Hold still')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Take photo' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Choose from gallery' })).toBeTruthy();
  });

  it('sends any other crop to an expert, with the photo when one is picked', async () => {
    mockPickFromLibrary.mockResolvedValue([photo]);
    await renderWithQuery(<DiseaseUploadScreen />, queryClient);
    await screen.findByText(/We can check/);
    await fireEvent.press(screen.getByText('Choose from gallery'));
    await screen.findByText('Check this photo');

    await fireEvent.press(screen.getByText('Other crops: Ask an expert'));
    expect(mockTabNavigate).toHaveBeenCalledWith(APP_TABS.Consultations, {
      screen: CONSULTATIONS_ROUTES.ExpertList,
      initial: false,
      params: {
        specialization: 'plant_diseases',
        prefill: { subject: 'Sick plant', problemDescription: '', cropId: null, imageUrl: 'file://leaf.jpg' },
      },
    });
  });

  it('checks a taken photo for the chosen crop, linking the shared crop row when there is one', async () => {
    mockTakePhoto.mockResolvedValue([photo]);
    await renderWithQuery(<DiseaseUploadScreen />, queryClient);
    await chooseCrop('Tomato');
    await fireEvent.press(screen.getByText('Take photo'));
    await fireEvent.press(await screen.findByText('Check this photo'));

    expect(mockNavigate).toHaveBeenCalledWith('DiseaseProcessing', {
      imageUri: 'file://leaf.jpg',
      imageFileName: 'leaf.jpg',
      imageType: 'image/jpeg',
      cropId: 'crop-7',
      cropKey: 'tomato',
      cropName: 'Tomato',
    });
  });

  it('cannot check a photo until a crop is chosen', async () => {
    mockTakePhoto.mockResolvedValue([photo]);
    await renderWithQuery(<DiseaseUploadScreen />, queryClient);
    await screen.findByText(/We can check/);
    await fireEvent.press(screen.getByText('Take photo'));

    expect(await screen.findByText('Choose the crop above to check this photo.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Check this photo' })).toBeDisabled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('lets the farmer take a different photo', async () => {
    mockTakePhoto.mockResolvedValue([photo]);
    await renderWithQuery(<DiseaseUploadScreen />, queryClient);
    await screen.findByText(/We can check/);
    await fireEvent.press(screen.getByText('Take photo'));
    await fireEvent.press(await screen.findByText('Take a different photo'));
    expect(screen.getByText('Take photo')).toBeTruthy();
  });

  it('explains a refused camera and opens settings', async () => {
    mockTakePhoto.mockResolvedValue([]);
    mockPermission.mockResolvedValue({ granted: false });
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    await renderWithQuery(<DiseaseUploadScreen />, queryClient);
    await screen.findByText(/We can check/);
    await fireEvent.press(screen.getByText('Take photo'));

    expect(await screen.findByText('The camera is turned off')).toBeTruthy();
    await fireEvent.press(screen.getByText('Open settings'));
    expect(openSettings).toHaveBeenCalled();
    openSettings.mockRestore();
  });

  it('shows no refusal guidance when the farmer only backs out of the camera', async () => {
    mockTakePhoto.mockResolvedValue([]);
    await renderWithQuery(<DiseaseUploadScreen />, queryClient);
    await screen.findByText(/We can check/);
    await fireEvent.press(screen.getByText('Take photo'));
    expect(screen.queryByText('The camera is turned off')).toBeNull();
  });

  it('says when the crop list could not load and retries', async () => {
    mockFetchSupportedCrops.mockRejectedValueOnce(new Error('offline'));
    await renderWithQuery(<DiseaseUploadScreen />, queryClient);
    expect(await screen.findByText("We couldn't load the crops we can check")).toBeTruthy();

    await fireEvent.press(screen.getByText('Try again'));
    expect(await screen.findByText(/We can check maize and tomato/)).toBeTruthy();
  });
});
