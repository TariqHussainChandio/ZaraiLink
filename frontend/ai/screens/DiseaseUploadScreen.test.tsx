import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { createTestQueryClient, renderWithQuery } from '../../testUtils/renderWithProviders';
import { queryKeys } from '../../hooks/keys';
import { DiseaseUploadScreen } from './DiseaseUploadScreen';
import { pickPhotos } from '../../utils/photoPicker';
import type { Crop } from '../../common/marketplace/types/marketplace';

const mockNavigate = jest.fn();

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({ navigate: mockNavigate }),
  };
});

jest.mock('../../utils/photoPicker', () => ({
  pickPhotos: jest.fn(),
}));

const mockPickPhotos = pickPhotos as jest.Mock;

const queryClient = createTestQueryClient();

const crops: Crop[] = [
  { id: 'crop-1', name: 'Wheat', category: null },
  { id: 'crop-2', name: 'Cotton', category: null },
];

beforeEach(() => {
  mockNavigate.mockReset();
  mockPickPhotos.mockReset();
  // Seed the query cache so the crop list is there without a network call.
  queryClient.clear();
  queryClient.setQueryData(queryKeys.marketplace.crops(), crops);
});

describe('DiseaseUploadScreen', () => {
  it('renders the title and crop picker options', async () => {
    await renderWithQuery(<DiseaseUploadScreen />, queryClient);
    expect(screen.getByText('Identify a Crop Disease')).toBeTruthy();
    await fireEvent.press(screen.getByText('Select...'));
    expect(screen.getByText('Wheat')).toBeTruthy();
    expect(screen.getByText('Cotton')).toBeTruthy();
  });

  it('disables Analyze until a photo is picked', async () => {
    await renderWithQuery(<DiseaseUploadScreen />, queryClient);
    expect(screen.getByText('Analyze').parent?.props.accessibilityState.disabled).toBe(true);
  });

  it('picks a photo and enables Analyze', async () => {
    mockPickPhotos.mockResolvedValue([{ uri: 'file://leaf.jpg', fileName: 'leaf.jpg', mimeType: 'image/jpeg' }]);
    await renderWithQuery(<DiseaseUploadScreen />, queryClient);
    await fireEvent.press(screen.getByText('+ Add Photo'));
    expect(await screen.findByText('Analyze')).toBeTruthy();

    await fireEvent.press(screen.getByText('Analyze'));
    expect(mockNavigate).toHaveBeenCalledWith('DiseaseProcessing', {
      imageUri: 'file://leaf.jpg',
      imageFileName: 'leaf.jpg',
      imageType: 'image/jpeg',
      cropId: null,
    });
  });

  it('includes the selected crop id when analyzing', async () => {
    mockPickPhotos.mockResolvedValue([{ uri: 'file://leaf.jpg' }]);
    await renderWithQuery(<DiseaseUploadScreen />, queryClient);

    await fireEvent.press(screen.getByText('Select...'));
    await fireEvent.press(screen.getByText('Wheat'));
    await fireEvent.press(screen.getByText('+ Add Photo'));
    await screen.findByText('Wheat');

    await fireEvent.press(screen.getByText('Analyze'));
    expect(mockNavigate).toHaveBeenCalledWith('DiseaseProcessing', expect.objectContaining({ cropId: 'crop-1' }));
  });

  it('does nothing when Analyze is pressed with no photo', async () => {
    await renderWithQuery(<DiseaseUploadScreen />, queryClient);
    await fireEvent.press(screen.getByText('Analyze'));
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
