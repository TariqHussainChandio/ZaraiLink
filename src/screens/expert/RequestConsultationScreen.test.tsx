import React from 'react';
import { Alert } from 'react-native';
import { launchImageLibraryAsync } from 'expo-image-picker';
import { fireEvent, render, screen } from '@testing-library/react-native';
import '../../localization';
import { RequestConsultationScreen } from './RequestConsultationScreen';
import { fetchFarms } from '../../services/modules/farmer/farmService';
import {
  createConsultationRequest,
  updateConsultationImages,
  uploadConsultationAttachments,
} from '../../services/modules/expert/consultationService';
import { useAuthStore } from '../../store/authStore';
import { useMarketplaceStore } from '../../store/marketplaceStore';
import type { ConsultationsScreenProps } from '../../navigation/stacks/ConsultationsNavigator';

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
}));

jest.mock('../../services/modules/farmer/farmService', () => ({
  fetchFarms: jest.fn(),
}));
jest.mock('../../services/modules/expert/consultationService', () => ({
  createConsultationRequest: jest.fn(),
  updateConsultationImages: jest.fn(),
  uploadConsultationAttachments: jest.fn(),
}));

const mockFetchFarms = fetchFarms as jest.Mock;
const mockCreateConsultationRequest = createConsultationRequest as jest.Mock;
const mockUpdateConsultationImages = updateConsultationImages as jest.Mock;
const mockUploadConsultationAttachments = uploadConsultationAttachments as jest.Mock;
const mockLaunchImageLibrary = launchImageLibraryAsync as jest.Mock;

function makeProps(prefill?: unknown) {
  return {
    navigation: { goBack: jest.fn() },
    route: { params: { expertId: 'expert1', prefill } },
  } as unknown as ConsultationsScreenProps<'RequestConsultation'>;
}

describe('RequestConsultationScreen', () => {
  beforeEach(() => {
    mockFetchFarms.mockReset().mockResolvedValue([]);
    mockCreateConsultationRequest.mockReset();
    mockUpdateConsultationImages.mockReset();
    mockUploadConsultationAttachments.mockReset();
    mockLaunchImageLibrary.mockReset();
    useAuthStore.setState({ user: { id: 'u1' } as never });
    useMarketplaceStore.setState({
      crops: [{ id: 'crop1', name: 'Wheat', category: null }],
      cropsLoaded: true,
      loadCrops: jest.fn(),
    });
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders the form with a default medium priority', async () => {
    await render(<RequestConsultationScreen {...makeProps()} />);
    expect(await screen.findByLabelText('Subject')).toBeTruthy();
    expect(screen.getByText('Medium')).toBeTruthy();
  });

  it('pre-fills subject and description from a disease-advisory handoff', async () => {
    const prefill = {
      subject: 'Yellowing wheat leaves',
      problemDescription: 'Leaves turning yellow near the base',
      cropId: 'crop1',
      imageUrl: null,
    };
    await render(<RequestConsultationScreen {...makeProps(prefill)} />);

    expect(await screen.findByLabelText('Subject')).toBeTruthy();
    expect(screen.getByLabelText('Subject').props.value).toBe('Yellowing wheat leaves');
    expect(screen.getByLabelText('Describe the problem').props.value).toBe(
      'Leaves turning yellow near the base',
    );
  });

  it('shows the Farm select once the farmer’s farms load', async () => {
    mockFetchFarms.mockResolvedValue([{ id: 'farm1', name: 'North Farm' }]);
    await render(<RequestConsultationScreen {...makeProps()} />);
    expect(await screen.findByText('Farm (optional)')).toBeTruthy();
  });

  it('shows a validation error when the subject is left empty', async () => {
    await render(<RequestConsultationScreen {...makeProps()} />);
    await screen.findByLabelText('Subject');

    await fireEvent.press(screen.getByText('Send Request'));
    expect(await screen.findByText('Enter a subject')).toBeTruthy();
    expect(mockCreateConsultationRequest).not.toHaveBeenCalled();
  });

  it('submits the request with no crop, farm, or images', async () => {
    mockCreateConsultationRequest.mockResolvedValue({ id: 'c1' });
    const props = makeProps();
    await render(<RequestConsultationScreen {...props} />);
    await fireEvent.changeText(await screen.findByLabelText('Subject'), 'Aphids on cotton');

    await fireEvent.press(screen.getByText('Send Request'));

    expect(mockCreateConsultationRequest).toHaveBeenCalledWith({
      expertId: 'expert1',
      subject: 'Aphids on cotton',
      cropId: null,
      problemDescription: '',
      farmId: null,
      images: [],
      priority: 'medium',
    });
    expect(mockUploadConsultationAttachments).not.toHaveBeenCalled();
    expect(props.navigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('uploads picked photos and attaches them after creating the consultation', async () => {
    mockLaunchImageLibrary.mockResolvedValue({ canceled: false, assets: [{ uri: 'file://photo1.jpg', fileName: 'photo1.jpg' }] });
    mockCreateConsultationRequest.mockResolvedValue({ id: 'c1' });
    mockUploadConsultationAttachments.mockResolvedValue(['c1/u1/photo1.jpg']);
    const props = makeProps();
    await render(<RequestConsultationScreen {...props} />);
    await fireEvent.changeText(await screen.findByLabelText('Subject'), 'Aphids on cotton');
    await fireEvent.press(screen.getByText('+ Add'));

    await fireEvent.press(screen.getByText('Send Request'));

    expect(mockUploadConsultationAttachments).toHaveBeenCalledWith('c1', 'u1', [
      { uri: 'file://photo1.jpg', fileName: 'photo1.jpg' },
    ]);
    expect(mockUpdateConsultationImages).toHaveBeenCalledWith('c1', ['c1/u1/photo1.jpg']);
    expect(props.navigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('shows an error alert and does not navigate back when the request fails', async () => {
    mockCreateConsultationRequest.mockRejectedValue(new Error('Server unavailable'));
    const props = makeProps();
    await render(<RequestConsultationScreen {...props} />);
    await fireEvent.changeText(await screen.findByLabelText('Subject'), 'Aphids on cotton');

    await fireEvent.press(screen.getByText('Send Request'));

    expect(Alert.alert).toHaveBeenCalledWith('Could not send request', 'Server unavailable');
    expect(props.navigation.goBack).not.toHaveBeenCalled();
  });
});
