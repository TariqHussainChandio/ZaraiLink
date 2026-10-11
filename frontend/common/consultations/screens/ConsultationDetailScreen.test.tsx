import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../../testUtils/renderWithProviders';
import { ConsultationDetailScreen } from './ConsultationDetailScreen';
import {
  createConsultationAssessment,
  fetchConsultationAssessments,
  fetchConsultationById,
  fetchConsultationMessages,
  resolveConsultationAttachmentUrls,
  sendConsultationMessage,
  updateConsultationStatus,
} from '../services/consultationService';
import { fetchListings } from '../../marketplace/services/listingsService';
import { createConsultationReview, fetchReviewByConsultationId } from '../../reviews/services/reviewsService';
import { APP_TABS, MARKETPLACE_ROUTES } from '../../constants/routes';
import { useAuthStore } from '../../../state/authStore';
import type { ConsultationMessageWithListing, ConsultationWithRelations } from '../../../expert/types/expert';
import type { AiCaseSummary, ConsultationAssessment, ConsultationDetail } from '../types/consultations';

const mockRouteParams = { consultationId: 'c1' };
const mockGetParent = jest.fn();
const mockNavigation = { getParent: mockGetParent };

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  const { useEffect } = jest.requireActual('react');
  return {
    ...actual,
    useFocusEffect: (effect: () => void) =>
      useEffect(() => {
        effect();
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []),
    useRoute: () => ({ params: mockRouteParams }),
    useNavigation: () => mockNavigation,
  };
});

jest.mock('../services/consultationService', () => ({
  createConsultationAssessment: jest.fn(),
  fetchConsultationAssessments: jest.fn(),
  fetchConsultationById: jest.fn(),
  fetchConsultationMessages: jest.fn(),
  resolveConsultationAttachmentUrls: jest.fn(),
  sendConsultationMessage: jest.fn(),
  updateConsultationStatus: jest.fn(),
  uploadConsultationAttachments: jest.fn(),
}));
jest.mock('../../marketplace/services/listingsService', () => ({
  fetchListings: jest.fn(),
}));
jest.mock('../../reviews/services/reviewsService', () => ({
  createConsultationReview: jest.fn(),
  fetchReviewByConsultationId: jest.fn(),
}));
jest.mock('../../../hooks/realtime/useRealtimeConsultationMessages', () => ({
  useRealtimeConsultationMessages: jest.fn(),
}));

const mockFetchConsultationById = fetchConsultationById as jest.Mock;
const mockFetchConsultationMessages = fetchConsultationMessages as jest.Mock;
const mockResolveAttachmentUrls = resolveConsultationAttachmentUrls as jest.Mock;
const mockSendConsultationMessage = sendConsultationMessage as jest.Mock;
const mockUpdateConsultationStatus = updateConsultationStatus as jest.Mock;
const mockFetchListings = fetchListings as jest.Mock;
const mockCreateConsultationReview = createConsultationReview as jest.Mock;
const mockFetchReviewByConsultationId = fetchReviewByConsultationId as jest.Mock;
const mockFetchConsultationAssessments = fetchConsultationAssessments as jest.Mock;
const mockCreateConsultationAssessment = createConsultationAssessment as jest.Mock;

const aiReport: AiCaseSummary = {
  case_id: 'case-1',
  image_url: 'https://signed.example/leaf.jpg',
  report: {
    predicted_disease: 'Tomato — Early blight',
    class_label: 'Tomato___Early_blight',
    crop: 'Tomato',
    disease: 'Early blight',
    confidence_score: 0.91,
    confidence_band: 'confident',
    is_healthy: false,
    symptoms: ['Brown rings on older leaves'],
    treatment: [],
    precautions: [],
    advisory: 'Remove the affected leaves.',
    review_status: 'pending_review',
    disclaimer: 'This AI result is advisory only. An expert should confirm it.',
    model_version: null,
    created_at: '2026-10-11T09:00:00.000Z',
  },
};

const assessment = (overrides: Partial<ConsultationAssessment> = {}): ConsultationAssessment => ({
  id: 'a1',
  consultation_id: 'c1',
  expert_id: 'expert1',
  verdict: 'agree',
  diagnosis: null,
  recommendations: 'Spray copper fungicide weekly.',
  created_at: '2026-10-11T10:00:00.000Z',
  ...overrides,
});

const consultation: ConsultationWithRelations = {
  id: 'c1',
  user_id: 'requester1',
  expert_id: 'expert1',
  subject: 'Yellowing wheat leaves',
  crop_id: 'crop1',
  problem_description: 'Leaves are turning yellow near the base.',
  farm_id: null,
  images: [],
  priority: 'medium',
  status: 'requested',
  created_at: '2026-08-20T10:00:00.000Z',
  updated_at: '2026-08-20T10:00:00.000Z',
  user: { id: 'requester1', full_name: 'Ali Raza', avatar_url: null },
  expert: { id: 'expert1', full_name: 'Dr. Ahsan', avatar_url: null },
  crop: { id: 'crop1', name: 'Wheat' },
};

function setup(
  overrides: Partial<ConsultationDetail> = {},
  messages: ConsultationMessageWithListing[] = [],
  assessments: ConsultationAssessment[] = [],
) {
  mockFetchConsultationById.mockResolvedValue({ ...consultation, ...overrides });
  mockFetchConsultationAssessments.mockResolvedValue(assessments);
  mockFetchConsultationMessages.mockResolvedValue(messages);
  mockFetchReviewByConsultationId.mockResolvedValue(null);
  mockResolveAttachmentUrls.mockResolvedValue({});
}

describe('ConsultationDetailScreen', () => {
  beforeEach(() => {
    mockGetParent.mockReset();
    mockFetchConsultationById.mockReset();
    mockFetchConsultationMessages.mockReset();
    mockResolveAttachmentUrls.mockReset();
    mockSendConsultationMessage.mockReset();
    mockUpdateConsultationStatus.mockReset();
    mockFetchListings.mockReset();
    mockCreateConsultationReview.mockReset();
    mockFetchReviewByConsultationId.mockReset();
    mockFetchConsultationAssessments.mockReset();
    mockCreateConsultationAssessment.mockReset();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders the consultation details and expert accept/reject actions for a pending request', async () => {
    setup();
    useAuthStore.setState({ user: { id: 'expert1' } as never });
    await renderWithQuery(<ConsultationDetailScreen />);

    expect(await screen.findByText('Yellowing wheat leaves')).toBeTruthy();
    expect(screen.getByText('With Ali Raza')).toBeTruthy();
    expect(screen.getByText('Requested')).toBeTruthy();
    expect(screen.getByText('Accept')).toBeTruthy();
    expect(screen.getByText('Reject')).toBeTruthy();
  });

  it('lets the expert accept a pending request', async () => {
    setup();
    mockUpdateConsultationStatus.mockResolvedValue(undefined);
    useAuthStore.setState({ user: { id: 'expert1' } as never });
    await renderWithQuery(<ConsultationDetailScreen />);

    await fireEvent.press(await screen.findByText('Accept'));
    expect(mockUpdateConsultationStatus).toHaveBeenCalledWith('c1', 'accepted');
  });

  it('shows a toast when advancing the status fails', async () => {
    setup();
    mockUpdateConsultationStatus.mockRejectedValue(new Error('Server unavailable'));
    useAuthStore.setState({ user: { id: 'expert1' } as never });
    await renderWithQuery(<ConsultationDetailScreen />);

    await fireEvent.press(await screen.findByText('Accept'));
    expect(await screen.findByText(/Server unavailable/)).toBeTruthy();
  });

  it('lets the requester cancel a pending request', async () => {
    setup();
    mockUpdateConsultationStatus.mockResolvedValue(undefined);
    useAuthStore.setState({ user: { id: 'requester1' } as never });
    await renderWithQuery(<ConsultationDetailScreen />);

    await fireEvent.press(await screen.findByText('Cancel Request'));
    expect(mockUpdateConsultationStatus).toHaveBeenCalledWith('c1', 'cancelled');
  });

  it('sends a chat message', async () => {
    setup();
    mockSendConsultationMessage.mockResolvedValue({
      id: 'm1',
      consultation_id: 'c1',
      sender_id: 'expert1',
      body: 'Please share a close-up photo',
      attachments: [],
      recommended_listing_id: null,
      recommended_listing: null,
      created_at: '2026-08-20T11:00:00.000Z',
    });
    useAuthStore.setState({ user: { id: 'expert1' } as never });
    await renderWithQuery(<ConsultationDetailScreen />);
    await screen.findByText('Yellowing wheat leaves');

    await fireEvent.changeText(screen.getByPlaceholderText('Type a message...'), 'Please share a close-up photo');
    await fireEvent.press(screen.getByLabelText('Send message'));

    expect(mockSendConsultationMessage).toHaveBeenCalledWith('c1', 'Please share a close-up photo', []);
    expect(await screen.findByText('Please share a close-up photo')).toBeTruthy();
  });

  it('lets the requester write a review once the consultation is resolved', async () => {
    setup({ status: 'resolved' });
    mockCreateConsultationReview.mockResolvedValue({
      id: 'r1',
      order_id: null,
      consultation_id: 'c1',
      listing_id: null,
      seller_id: 'expert1',
      buyer_id: 'requester1',
      rating: 5,
      comment: null,
      created_at: '2026-08-21T00:00:00.000Z',
    });
    useAuthStore.setState({ user: { id: 'requester1' } as never });
    await renderWithQuery(<ConsultationDetailScreen />);

    await fireEvent.press(await screen.findByText('Write a Review'));
    await fireEvent.press(screen.getByText('Submit Review'));

    expect(mockCreateConsultationReview).toHaveBeenCalledWith('c1', 5, null);
  });

  it('lets the expert open the recommend sheet and send a product recommendation', async () => {
    setup();
    mockFetchListings.mockResolvedValue([{ id: 'l1', title: 'Copper Fungicide' }]);
    mockSendConsultationMessage.mockResolvedValue({
      id: 'm2',
      consultation_id: 'c1',
      sender_id: 'expert1',
      body: 'Recommended: Copper Fungicide',
      attachments: [],
      recommended_listing_id: 'l1',
      recommended_listing: { id: 'l1', title: 'Copper Fungicide', price: 850, unit: 'bottle' },
      created_at: '2026-08-20T12:00:00.000Z',
    });
    useAuthStore.setState({ user: { id: 'expert1' } as never });
    await renderWithQuery(<ConsultationDetailScreen />);

    await fireEvent.press(await screen.findByText('Recommend a Product'));
    expect(mockFetchListings).toHaveBeenCalledWith({});
    await fireEvent.press(await screen.findByText('Select...'));
    await fireEvent.press(screen.getByText('Copper Fungicide'));
    await fireEvent.press(screen.getByText('Send Recommendation'));

    expect(mockSendConsultationMessage).toHaveBeenCalledWith('c1', 'Recommended: Copper Fungicide', [], 'l1');
  });

  it('navigates to the marketplace listing when a recommended product is tapped', async () => {
    const message: ConsultationMessageWithListing = {
      id: 'm3',
      consultation_id: 'c1',
      sender_id: 'expert1',
      body: '',
      attachments: [],
      recommended_listing_id: 'l1',
      recommended_listing: { id: 'l1', title: 'Copper Fungicide', price: 850, unit: 'bottle' },
      created_at: '2026-08-20T12:00:00.000Z',
    };
    setup({}, [message]);
    const mockTabNavigate = jest.fn();
    mockGetParent.mockReturnValue({ navigate: mockTabNavigate });
    useAuthStore.setState({ user: { id: 'requester1' } as never });
    await renderWithQuery(<ConsultationDetailScreen />);

    await fireEvent.press(
      await screen.findByLabelText('Recommended listing: Copper Fungicide, Rs 850 per bottle'),
    );
    expect(mockTabNavigate).toHaveBeenCalledWith(APP_TABS.Marketplace, {
      screen: MARKETPLACE_ROUTES.ListingDetail,
      params: { listingId: 'l1' },
    });
  });

  describe('AI assessment and Expert Assessment (A6)', () => {
    it('shows the AI card with its disclaimer apart from the expert panel', async () => {
      setup({ status: 'accepted', disease_case_id: 'case-1', ai_report: aiReport }, [], [assessment()]);
      useAuthStore.setState({ user: { id: 'requester1' } as never });
      await renderWithQuery(<ConsultationDetailScreen />);

      expect(await screen.findByText('AI assessment')).toBeTruthy();
      expect(screen.getByLabelText('AI finding: Early blight')).toBeTruthy();
      expect(screen.getByText(/Confident \(91\s?%\)/)).toBeTruthy();
      expect(screen.getByText('Pending agronomist review')).toBeTruthy();
      expect(screen.getByText(aiReport.report.disclaimer)).toBeTruthy();
      expect(screen.getByLabelText('Photo of the plant the AI assessed')).toBeTruthy();

      expect(screen.getByText('Expert assessment')).toBeTruthy();
      expect(screen.getByText('By Dr. Ahsan')).toBeTruthy();
      expect(await screen.findByText('Agrees with AI')).toBeTruthy();
      expect(screen.getByText('Spray copper fungicide weekly.')).toBeTruthy();
      expect(mockFetchConsultationAssessments).toHaveBeenCalledWith('c1');
      // The requester reads both but cannot assess.
      expect(screen.queryByText('Add assessment')).toBeNull();
    });

    it('words a healthy AI result as the AI’s estimate and keeps the advisory label (BR-13)', async () => {
      const healthyReport: AiCaseSummary = {
        ...aiReport,
        report: { ...aiReport.report, is_healthy: true, disease: 'Healthy' },
      };
      setup({ status: 'accepted', disease_case_id: 'case-1', ai_report: healthyReport });
      useAuthStore.setState({ user: { id: 'requester1' } as never });
      await renderWithQuery(<ConsultationDetailScreen />);

      expect(await screen.findByText('AI assessment')).toBeTruthy();
      expect(screen.getByLabelText('AI finding: AI found no sign of disease')).toBeTruthy();
      expect(screen.queryByText('No disease found')).toBeNull();
      expect(screen.getByText('AI advisory')).toBeTruthy();
      expect(screen.getByText(aiReport.report.disclaimer)).toBeTruthy();
      expect(screen.getByText('Expert assessment')).toBeTruthy();
    });

    it('shows no AI card without an attached case, and an empty expert panel', async () => {
      setup({ status: 'accepted', ai_report: null });
      useAuthStore.setState({ user: { id: 'requester1' } as never });
      await renderWithQuery(<ConsultationDetailScreen />);

      expect(await screen.findByText('The expert has not given an assessment yet.')).toBeTruthy();
      expect(screen.queryByText('AI assessment')).toBeNull();
    });

    it('lists the newest assessment first, with the corrected diagnosis', async () => {
      setup({ status: 'in_progress', ai_report: aiReport }, [], [
        assessment({ id: 'a1', created_at: '2026-10-11T10:00:00.000Z' }),
        assessment({
          id: 'a2',
          verdict: 'correct',
          diagnosis: 'Septoria leaf spot',
          recommendations: null,
          created_at: '2026-10-11T12:00:00.000Z',
        }),
      ]);
      useAuthStore.setState({ user: { id: 'requester1' } as never });
      await renderWithQuery(<ConsultationDetailScreen />);

      await screen.findByText('Corrected diagnosis');
      expect(screen.getByText('Septoria leaf spot')).toBeTruthy();
      const rendered = JSON.stringify(screen.toJSON());
      expect(rendered.indexOf('Corrected diagnosis')).toBeLessThan(rendered.indexOf('Agrees with AI'));
    });

    it('does not offer Add assessment before the expert accepts', async () => {
      setup({ status: 'requested' });
      useAuthStore.setState({ user: { id: 'expert1' } as never });
      await renderWithQuery(<ConsultationDetailScreen />);
      await screen.findByText('Accept');
      expect(screen.queryByText('Add assessment')).toBeNull();
    });

    it('offers Add assessment to the assigned expert once accepted', async () => {
      setup({ status: 'accepted' });
      useAuthStore.setState({ user: { id: 'expert1' } as never });
      await renderWithQuery(<ConsultationDetailScreen />);
      expect(await screen.findByText('Add assessment')).toBeTruthy();
    });

    it('lets the assigned expert add an assessment, asking for a diagnosis when correcting', async () => {
      setup({ status: 'in_progress', ai_report: aiReport });
      mockCreateConsultationAssessment.mockResolvedValue(
        assessment({ id: 'a3', verdict: 'correct', diagnosis: 'Septoria leaf spot' }),
      );
      useAuthStore.setState({ user: { id: 'expert1' } as never });
      await renderWithQuery(<ConsultationDetailScreen />);

      await fireEvent.press(await screen.findByText('Add assessment'));
      await fireEvent.press(screen.getByText('Save assessment'));
      expect(await screen.findByText('Choose a verdict')).toBeTruthy();

      await fireEvent.press(screen.getByText('Corrected diagnosis'));
      await fireEvent.press(screen.getByText('Save assessment'));
      expect(await screen.findByText('Enter your diagnosis')).toBeTruthy();
      expect(mockCreateConsultationAssessment).not.toHaveBeenCalled();

      await fireEvent.changeText(screen.getByLabelText('Diagnosis'), '  Septoria leaf spot ');
      await fireEvent.press(screen.getByText('Save assessment'));

      expect(mockCreateConsultationAssessment).toHaveBeenCalledWith('c1', {
        verdict: 'correct',
        diagnosis: 'Septoria leaf spot',
        recommendations: null,
      });
      expect(await screen.findByText('Assessment saved')).toBeTruthy();
    });

    it('keeps the sheet open with the server refusal when saving fails', async () => {
      const refusal = 'Only the assigned expert can assess an accepted or in-progress consultation';
      setup({ status: 'accepted' });
      mockCreateConsultationAssessment.mockRejectedValue(new Error(refusal));
      useAuthStore.setState({ user: { id: 'expert1' } as never });
      await renderWithQuery(<ConsultationDetailScreen />);

      await fireEvent.press(await screen.findByText('Add assessment'));
      await fireEvent.press(screen.getByText('Agrees with AI'));
      await fireEvent.press(screen.getByText('Save assessment'));

      expect(await screen.findByText('Could not save the assessment')).toBeTruthy();
      expect(screen.getByText(refusal)).toBeTruthy();
    });
  });
});
