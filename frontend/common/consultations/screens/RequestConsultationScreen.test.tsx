import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { createTestQueryClient, renderWithQuery } from '../../../testUtils/renderWithProviders';
import { queryKeys } from '../../../hooks/keys';
import { RequestConsultationScreen } from './RequestConsultationScreen';
import { fetchFarms } from '../../../farmer/services/farmService';
import {
  createConsultationRequest,
  updateConsultationImages,
  uploadConsultationAttachments,
} from '../services/consultationService';
import { useAuthStore } from '../../../state/authStore';
import { pickFromLibrary } from '../../../utils/photoPicker';
import type { ConsultationsScreenProps } from '../../../navigation/stacks/ConsultationsNavigator';

const queryClient = createTestQueryClient();

// The picker's own re-encoding is tested with photoPicker; here only what it hands back matters.
jest.mock('../../../utils/photoPicker', () => ({
  pickFromLibrary: jest.fn(),
}));

jest.mock('../../../farmer/services/farmService', () => ({
  fetchFarms: jest.fn(),
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
const mockPickFromLibrary = pickFromLibrary as jest.Mock;

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
    mockPickFromLibrary.mockReset();
    useAuthStore.setState({ user: { id: 'u1' } as never });
    queryClient.clear();
    queryClient.setQueryData(queryKeys.marketplace.crops(), [{ id: 'crop1', name: 'Wheat', category: null }]);
  });

  it('renders the form with a default medium priority', async () => {
    await renderWithQuery(<RequestConsultationScreen {...makeProps()} />, queryClient);
    expect(await screen.findByLabelText('Subject')).toBeTruthy();
    expect(screen.getByText('Medium')).toBeTruthy();
  });

  it('pre-fills the subject from a disease-advisory handoff and leaves the description to the farmer', async () => {
    const prefill = {
      subject: 'Yellowing wheat leaves',
      cropId: 'crop1',
      imageUrl: null,
    };
    await renderWithQuery(<RequestConsultationScreen {...makeProps(prefill)} />, queryClient);

    expect(await screen.findByLabelText('Subject')).toBeTruthy();
    expect(screen.getByLabelText('Subject').props.value).toBe('Yellowing wheat leaves');
    // BR-13, SRDS §34-§36: AI-written text never lands in the farmer's own field.
    expect(screen.getByLabelText('Describe the problem').props.value).toBe('');
  });

  it('shows the Farm select once the farmer’s farms load', async () => {
    mockFetchFarms.mockResolvedValue([{ id: 'farm1', name: 'North Farm' }]);
    await renderWithQuery(<RequestConsultationScreen {...makeProps()} />, queryClient);
    expect(await screen.findByText('Farm (optional)')).toBeTruthy();
  });

  it('shows a validation error when the subject is left empty', async () => {
    await renderWithQuery(<RequestConsultationScreen {...makeProps()} />, queryClient);
    await screen.findByLabelText('Subject');

    await fireEvent.press(screen.getByText('Send Request'));
    expect(await screen.findByText('Enter a subject')).toBeTruthy();
    expect(mockCreateConsultationRequest).not.toHaveBeenCalled();
  });

  it('submits the request with no crop, farm, or images', async () => {
    mockCreateConsultationRequest.mockResolvedValue({ id: 'c1' });
    const props = makeProps();
    await renderWithQuery(<RequestConsultationScreen {...props} />, queryClient);
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
    mockPickFromLibrary.mockResolvedValue([{ uri: 'file://photo1.jpg', fileName: 'photo1.jpg', mimeType: 'image/jpeg' }]);
    mockCreateConsultationRequest.mockResolvedValue({ id: 'c1' });
    mockUploadConsultationAttachments.mockResolvedValue(['c1/u1/photo1.jpg']);
    const props = makeProps();
    await renderWithQuery(<RequestConsultationScreen {...props} />, queryClient);
    await fireEvent.changeText(await screen.findByLabelText('Subject'), 'Aphids on cotton');
    await fireEvent.press(screen.getByLabelText('Add photos'));
    expect(await screen.findByLabelText('Photo 1 of 1')).toBeTruthy();

    await fireEvent.press(screen.getByText('Send Request'));

    expect(mockUploadConsultationAttachments).toHaveBeenCalledWith('c1', 'u1', [
      { uri: 'file://photo1.jpg', fileName: 'photo1.jpg', mimeType: 'image/jpeg' },
    ]);
    expect(mockUpdateConsultationImages).toHaveBeenCalledWith('c1', ['c1/u1/photo1.jpg']);
    expect(props.navigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('shows the error on screen and does not navigate back when the request fails', async () => {
    mockCreateConsultationRequest.mockRejectedValue(new Error('Server unavailable'));
    const props = makeProps();
    await renderWithQuery(<RequestConsultationScreen {...props} />, queryClient);
    await fireEvent.changeText(await screen.findByLabelText('Subject'), 'Aphids on cotton');

    await fireEvent.press(screen.getByText('Send Request'));

    expect(await screen.findByText('Could not send request')).toBeTruthy();
    expect(screen.getByText('Server unavailable')).toBeTruthy();
    expect(props.navigation.goBack).not.toHaveBeenCalled();
  });

  it('shows no AI report row for a plain question and sends no disease case', async () => {
    mockCreateConsultationRequest.mockResolvedValue({ id: 'c1' });
    await renderWithQuery(<RequestConsultationScreen {...makeProps()} />, queryClient);
    await fireEvent.changeText(await screen.findByLabelText('Subject'), 'Aphids on cotton');
    expect(screen.queryByText('AI report attached')).toBeNull();

    await fireEvent.press(screen.getByText('Send Request'));

    expect(mockCreateConsultationRequest.mock.calls[0][0].diseaseCaseId).toBeUndefined();
  });

  it('carries the AI disease case to the expert from a scan handoff', async () => {
    mockCreateConsultationRequest.mockResolvedValue({ id: 'c1' });
    const prefill = {
      subject: 'Tomato — Early blight',
      cropId: null,
      imageUrl: null,
      diseaseCaseId: 'case-1',
    };
    const props = makeProps(prefill);
    await renderWithQuery(<RequestConsultationScreen {...props} />, queryClient);

    // BR-13: the farmer is told the AI result goes with the request and the expert gives their own assessment.
    expect(await screen.findByText('AI report attached')).toBeTruthy();
    expect(screen.getByText('The expert will see the AI result and give their own assessment.')).toBeTruthy();

    await fireEvent.press(screen.getByText('Send Request'));

    expect(mockCreateConsultationRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        expertId: 'expert1',
        subject: 'Tomato — Early blight',
        diseaseCaseId: 'case-1',
        // The AI text stays in the linked case, not in the farmer's description.
        problemDescription: '',
      }),
    );
    expect(props.navigation.goBack).toHaveBeenCalledTimes(1);
    // A null photo link (no longer in storage) shows no preview.
    expect(screen.queryByLabelText('Photo from your scan')).toBeNull();
  });

  it('previews the case photo but does not re-upload its expiring signed link', async () => {
    mockCreateConsultationRequest.mockResolvedValue({ id: 'c1' });
    const prefill = {
      subject: 'Tomato — Early blight',
      cropId: null,
      imageUrl: 'https://signed.example/case-1.jpg?token=short-lived',
      diseaseCaseId: 'case-1',
    };
    const props = makeProps(prefill);
    await renderWithQuery(<RequestConsultationScreen {...props} />, queryClient);

    expect(await screen.findByLabelText('Photo from your scan')).toBeTruthy();
    expect(screen.getByText('Photo from your scan (attached with the AI report)')).toBeTruthy();
    // It is not an attachment: the picker still offers to add photos, not to change one.
    expect(screen.getByLabelText('Add photos')).toBeTruthy();
    expect(screen.queryByLabelText('Photo 1 of 1')).toBeNull();

    await fireEvent.press(screen.getByText('Send Request'));

    expect(mockCreateConsultationRequest).toHaveBeenCalledWith(expect.objectContaining({ diseaseCaseId: 'case-1' }));
    // The expert sees the photo through the case summary; nothing is fetched from the signed URL.
    expect(mockUploadConsultationAttachments).not.toHaveBeenCalled();
    expect(props.navigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('uploads only the photos the farmer adds by hand alongside a case photo', async () => {
    mockPickFromLibrary.mockResolvedValue([{ uri: 'file://photo1.jpg', fileName: 'photo1.jpg', mimeType: 'image/jpeg' }]);
    mockCreateConsultationRequest.mockResolvedValue({ id: 'c1' });
    mockUploadConsultationAttachments.mockResolvedValue(['c1/u1/photo1.jpg']);
    const prefill = {
      subject: 'Tomato — Early blight',
      cropId: null,
      imageUrl: 'https://signed.example/case-1.jpg?token=short-lived',
      diseaseCaseId: 'case-1',
    };
    await renderWithQuery(<RequestConsultationScreen {...makeProps(prefill)} />, queryClient);
    await fireEvent.press(await screen.findByLabelText('Add photos'));
    expect(await screen.findByLabelText('Photo 1 of 1')).toBeTruthy();

    await fireEvent.press(screen.getByText('Send Request'));

    expect(mockUploadConsultationAttachments).toHaveBeenCalledWith('c1', 'u1', [
      { uri: 'file://photo1.jpg', fileName: 'photo1.jpg', mimeType: 'image/jpeg' },
    ]);
    expect(mockUpdateConsultationImages).toHaveBeenCalledWith('c1', ['c1/u1/photo1.jpg']);
  });

  it('still attaches the scan photo when no case was recorded', async () => {
    mockCreateConsultationRequest.mockResolvedValue({ id: 'c1' });
    mockUploadConsultationAttachments.mockResolvedValue(['c1/u1/disease-photo.jpg']);
    const prefill = { subject: 'Crop disease advisory', cropId: null, imageUrl: 'file://scan.jpg' };
    await renderWithQuery(<RequestConsultationScreen {...makeProps(prefill)} />, queryClient);

    expect(await screen.findByLabelText('Photo 1 of 1')).toBeTruthy();
    expect(screen.queryByLabelText('Photo from your scan')).toBeNull();

    await fireEvent.press(screen.getByText('Send Request'));

    expect(mockUploadConsultationAttachments).toHaveBeenCalledWith('c1', 'u1', [
      { uri: 'file://scan.jpg', fileName: 'disease-photo.jpg', mimeType: 'image/jpeg' },
    ]);
  });
});
