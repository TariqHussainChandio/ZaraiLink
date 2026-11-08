import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { createTestQueryClient, renderWithQuery } from '../../../testUtils/renderWithProviders';
import { queryKeys } from '../../../hooks/keys';
import { RequestConsultationScreen } from './RequestConsultationScreen';
import { fetchFarms } from '../../../farmer/services/farmService';
import {
  createConsultationRequest,
  updateConsultationImages,
  uploadConsultationAttachments,
} from '../services/consultationService';
import { pickPhotos } from '../../../utils/photoPicker';
import { fetchExpertById } from '../../../expert/services/expertService';
import { fetchReviewsForExpert } from '../../reviews/services/reviewsService';
import { useAuthStore } from '../../../state/authStore';
import type { ConsultationsScreenProps } from '../../../navigation/stacks/ConsultationsNavigator';

const queryClient = createTestQueryClient();

jest.mock('../../../utils/photoPicker', () => ({
  pickPhotos: jest.fn(),
}));
jest.mock('../../../farmer/services/farmService', () => ({
  fetchFarms: jest.fn(),
}));
jest.mock('../../../expert/services/expertService', () => ({
  fetchExpertById: jest.fn(),
}));
jest.mock('../../reviews/services/reviewsService', () => ({
  fetchReviewsForExpert: jest.fn(),
}));
jest.mock('../services/consultationService', () => ({
  createConsultationRequest: jest.fn(),
  updateConsultationImages: jest.fn(),
  uploadConsultationAttachments: jest.fn(),
}));

const mockFetchFarms = fetchFarms as jest.Mock;
const mockCreateConsultationRequest = createConsultationRequest as jest.Mock;
const mockUpdateConsultationImages = updateConsultationImages as jest.Mock;
const mockUploadConsultationAttachments = uploadConsultationAttachments as jest.Mock;
const mockPickPhotos = pickPhotos as jest.Mock;
const mockFetchExpertById = fetchExpertById as jest.Mock;
const mockFetchReviews = fetchReviewsForExpert as jest.Mock;

function makeProps(prefill?: unknown) {
  return {
    navigation: { replace: jest.fn() },
    route: { params: { expertId: 'expert1', prefill } },
  } as unknown as ConsultationsScreenProps<'RequestConsultation'>;
}

describe('RequestConsultationScreen', () => {
  beforeEach(() => {
    mockFetchFarms.mockReset().mockResolvedValue([]);
    mockCreateConsultationRequest.mockReset();
    mockUpdateConsultationImages.mockReset();
    mockUploadConsultationAttachments.mockReset();
    mockPickPhotos.mockReset();
    mockFetchExpertById.mockReset().mockResolvedValue({
      id: 'expert1',
      profile: { id: 'expert1', full_name: 'Dr Ali' },
      expert_specializations: [],
    });
    mockFetchReviews.mockReset().mockResolvedValue([]);
    useAuthStore.setState({ user: { id: 'u1' } as never });
    queryClient.clear();
    queryClient.setQueryData(queryKeys.marketplace.crops(), [{ id: 'crop1', name: 'Wheat', category: null }]);
  });

  it('renders the form with Medium urgency chosen', async () => {
    await renderWithQuery(<RequestConsultationScreen {...makeProps()} />, queryClient);
    expect(await screen.findByLabelText('Subject')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Medium' }).props.accessibilityState).toMatchObject({ selected: true });
  });

  it("brings the scan's crop and photo along, never its description", async () => {
    const prefill = {
      subject: 'Yellowing wheat leaves',
      problemDescription: 'AI text that must not appear',
      cropId: 'crop1',
      imageUrl: 'https://example.com/leaf.jpg',
    };
    await renderWithQuery(<RequestConsultationScreen {...makeProps(prefill)} />, queryClient);

    expect(await screen.findByLabelText('Subject')).toBeTruthy();
    expect(screen.getByLabelText('Describe the problem').props.value).toBe('');
    expect(screen.queryByText('AI text that must not appear')).toBeNull();
    expect(screen.getByText('What do you see? Since when?')).toBeTruthy();
    expect(screen.getByLabelText('Photo 1 of 1')).toBeTruthy();
  });

  it('shows the Farm select once the farmer’s farms load', async () => {
    mockFetchFarms.mockResolvedValue([{ id: 'farm1', name: 'North Farm' }]);
    await renderWithQuery(<RequestConsultationScreen {...makeProps()} />, queryClient);
    expect(await screen.findByText('Farm (optional)')).toBeTruthy();
  });

  it('shows a validation error when the subject is left empty', async () => {
    await renderWithQuery(<RequestConsultationScreen {...makeProps()} />, queryClient);
    await screen.findByLabelText('Subject');

    await fireEvent.press(screen.getByText('Send request'));
    expect(await screen.findByText('Enter a subject')).toBeTruthy();
    expect(mockCreateConsultationRequest).not.toHaveBeenCalled();
  });

  it('sends the request, opens the new case and confirms it to the expert by name', async () => {
    mockCreateConsultationRequest.mockResolvedValue({ id: 'c1' });
    const props = makeProps();
    await renderWithQuery(<RequestConsultationScreen {...props} />, queryClient);
    await fireEvent.changeText(await screen.findByLabelText('Subject'), 'Aphids on cotton');
    // The expert's name is what the confirmation uses.
    await waitFor(() => expect(mockFetchExpertById).toHaveBeenCalled());

    await fireEvent.press(screen.getByText('Send request'));
    await waitFor(() => expect(props.navigation.replace).toHaveBeenCalled());

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
    expect(props.navigation.replace).toHaveBeenCalledWith('ConsultationDetail', { consultationId: 'c1' });
    expect(await screen.findByText('Request sent to Dr Ali')).toBeTruthy();
  });

  it('adds photos to the ones chosen, lets one be removed, and uploads the rest after creating the request', async () => {
    mockPickPhotos
      .mockResolvedValueOnce([
        {
          uri: 'file://photo1.jpg',
          fileName: 'photo1.jpg',
          mimeType: 'image/jpeg',
        },
      ])
      .mockResolvedValueOnce([
        {
          uri: 'file://photo2.jpg',
          fileName: 'photo2.jpg',
          mimeType: 'image/jpeg',
        },
      ]);
    mockCreateConsultationRequest.mockResolvedValue({ id: 'c1' });
    mockUploadConsultationAttachments.mockResolvedValue(['c1/u1/photo2.jpg']);
    const props = makeProps();
    await renderWithQuery(<RequestConsultationScreen {...props} />, queryClient);
    await fireEvent.changeText(await screen.findByLabelText('Subject'), 'Aphids on cotton');

    await fireEvent.press(screen.getByText('Add photo'));
    expect(await screen.findByLabelText('Photo 1 of 1')).toBeTruthy();
    await fireEvent.press(screen.getByText('Add photo'));
    expect(await screen.findByLabelText('Photo 2 of 2')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Remove photo 1'));
    expect(screen.queryByLabelText('Photo 2 of 2')).toBeNull();

    await fireEvent.press(screen.getByText('Send request'));
    await waitFor(() => expect(props.navigation.replace).toHaveBeenCalled());

    expect(mockUploadConsultationAttachments).toHaveBeenCalledWith('c1', 'u1', [
      {
        uri: 'file://photo2.jpg',
        fileName: 'photo2.jpg',
        mimeType: 'image/jpeg',
      },
    ]);
    expect(mockUpdateConsultationImages).toHaveBeenCalledWith('c1', ['c1/u1/photo2.jpg']);
  });

  it('opens the case and says the photos did not upload, instead of calling the sent request a failure', async () => {
    mockPickPhotos.mockResolvedValue([
      {
        uri: 'file://photo1.jpg',
        fileName: 'photo1.jpg',
        mimeType: 'image/jpeg',
      },
    ]);
    mockCreateConsultationRequest.mockResolvedValue({ id: 'c1' });
    mockUploadConsultationAttachments.mockRejectedValue(new Error('Storage down'));
    const props = makeProps();
    await renderWithQuery(<RequestConsultationScreen {...props} />, queryClient);
    await fireEvent.changeText(await screen.findByLabelText('Subject'), 'Aphids on cotton');
    await fireEvent.press(screen.getByText('Add photo'));

    await fireEvent.press(screen.getByText('Send request'));
    await waitFor(() =>
      expect(props.navigation.replace).toHaveBeenCalledWith('ConsultationDetail', { consultationId: 'c1' }),
    );

    expect(await screen.findByText('Request sent, but the photos did not upload. Send them in the case.')).toBeTruthy();
    expect(mockCreateConsultationRequest).toHaveBeenCalledTimes(1);
  });

  it('shows the reason in a banner and stays on the form when the request fails', async () => {
    mockCreateConsultationRequest.mockRejectedValue(new Error('Server unavailable'));
    const props = makeProps();
    await renderWithQuery(<RequestConsultationScreen {...props} />, queryClient);
    await fireEvent.changeText(await screen.findByLabelText('Subject'), 'Aphids on cotton');

    await fireEvent.press(screen.getByText('Send request'));

    expect(await screen.findByText("Couldn't send your request")).toBeTruthy();
    expect(screen.getByText('Server unavailable')).toBeTruthy();
    expect(props.navigation.replace).not.toHaveBeenCalled();
  });
});
