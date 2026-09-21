import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import '../../localization';
import { DiseaseUploadScreen } from './DiseaseUploadScreen';
import { pickPhotos } from '../../utils/photoPicker';
import { useMarketplaceStore } from '../../store/marketplaceStore';
import type { Crop } from '../../types/marketplace';

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

const crops: Crop[] = [
  { id: 'crop-1', name: 'Wheat', category: null },
  { id: 'crop-2', name: 'Cotton', category: null },
];

beforeEach(() => {
  mockNavigate.mockReset();
  mockPickPhotos.mockReset();
  // Seed the store as already loaded so `loadCrops`'s early-return skips the real network
  // call (`fetchCrops`), same as seeding any other zustand store in these tests.
  useMarketplaceStore.setState({ crops, cropsLoaded: true });
});

describe('DiseaseUploadScreen', () => {
  it('renders the title and crop picker options', async () => {
    await render(<DiseaseUploadScreen />);
    expect(screen.getByText('Identify a Crop Disease')).toBeTruthy();
    await fireEvent.press(screen.getByText('Select...'));
    expect(screen.getByText('Wheat')).toBeTruthy();
    expect(screen.getByText('Cotton')).toBeTruthy();
  });

  it('disables Analyze until a photo is picked', async () => {
    await render(<DiseaseUploadScreen />);
    expect(screen.getByText('Analyze').parent?.props.accessibilityState.disabled).toBe(true);
  });

  it('picks a photo and enables Analyze', async () => {
    mockPickPhotos.mockResolvedValue([{ uri: 'file://leaf.jpg', fileName: 'leaf.jpg', type: 'image/jpeg' }]);
    await render(<DiseaseUploadScreen />);
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
    await render(<DiseaseUploadScreen />);

    await fireEvent.press(screen.getByText('Select...'));
    await fireEvent.press(screen.getByText('Wheat'));
    await fireEvent.press(screen.getByText('+ Add Photo'));
    await screen.findByText('Wheat');

    await fireEvent.press(screen.getByText('Analyze'));
    expect(mockNavigate).toHaveBeenCalledWith('DiseaseProcessing', expect.objectContaining({ cropId: 'crop-1' }));
  });

  it('does nothing when Analyze is pressed with no photo', async () => {
    await render(<DiseaseUploadScreen />);
    await fireEvent.press(screen.getByText('Analyze'));
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
