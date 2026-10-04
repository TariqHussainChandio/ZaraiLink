import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../../testUtils/renderWithProviders';
import { ConsultationDetailScreen } from './ConsultationDetailScreen';
import {
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

function setup(overrides: Partial<ConsultationWithRelations> = {}, messages: ConsultationMessageWithListing[] = []) {
  mockFetchConsultationById.mockResolvedValue({ ...consultation, ...overrides });
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

  it('shows an alert when advancing the status fails', async () => {
    setup();
    mockUpdateConsultationStatus.mockRejectedValue(new Error('Server unavailable'));
    useAuthStore.setState({ user: { id: 'expert1' } as never });
    await renderWithQuery(<ConsultationDetailScreen />);

    await fireEvent.press(await screen.findByText('Accept'));
    expect(Alert.alert).toHaveBeenCalledWith('Could not update consultation', 'Server unavailable');
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
});
