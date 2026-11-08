import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
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

const mockRouteParams: { consultationId: string; aiSuggestion?: unknown } = {
  consultationId: 'c1',
};
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
  mockFetchConsultationById.mockResolvedValue({
    ...consultation,
    ...overrides,
  });
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
    delete mockRouteParams.aiSuggestion;
  });

  it("shows the case, the requester's words under their name, and the expert's Accept and Decline", async () => {
    setup();
    useAuthStore.setState({ user: { id: 'expert1' } as never });
    await renderWithQuery(<ConsultationDetailScreen />);

    expect(await screen.findByText('Yellowing wheat leaves')).toBeTruthy();
    expect(screen.getByText('With Ali Raza · Wheat')).toBeTruthy();
    expect(screen.getByText('Requested')).toBeTruthy();
    expect(screen.getByText('Medium priority')).toBeTruthy();
    expect(screen.getByText("Ali Raza's description")).toBeTruthy();
    expect(screen.getByText('Accept')).toBeTruthy();
    expect(screen.getByText('Decline')).toBeTruthy();
    // Not before the status allows it.
    expect(screen.queryByText('Recommend a product')).toBeNull();
    expect(screen.queryByText(/AI suggestion/)).toBeNull();
  });

  it('shows the AI suggestion as its own block when the scan sent one', async () => {
    mockRouteParams.aiSuggestion = { label: 'Leaf rust', confidence: 0.73 };
    setup();
    useAuthStore.setState({ user: { id: 'expert1' } as never });
    await renderWithQuery(<ConsultationDetailScreen />);

    expect(await screen.findByText("AI suggestion, not an expert's assessment")).toBeTruthy();
    expect(screen.getByText('Leaf rust, likely (73%)')).toBeTruthy();
  });

  it('lets the expert accept a pending request', async () => {
    setup();
    mockUpdateConsultationStatus.mockResolvedValue(undefined);
    useAuthStore.setState({ user: { id: 'expert1' } as never });
    await renderWithQuery(<ConsultationDetailScreen />);

    await fireEvent.press(await screen.findByText('Accept'));
    expect(mockUpdateConsultationStatus).toHaveBeenCalledWith('c1', 'accepted');
  });

  it('says so in a snackbar when advancing the status fails', async () => {
    setup();
    mockUpdateConsultationStatus.mockRejectedValue(new Error('Server unavailable'));
    useAuthStore.setState({ user: { id: 'expert1' } as never });
    await renderWithQuery(<ConsultationDetailScreen />);

    await fireEvent.press(await screen.findByText('Accept'));
    expect(await screen.findByText("Couldn't update the consultation. Server unavailable")).toBeTruthy();
  });

  it('asks before declining, and declines only after the confirmation', async () => {
    setup();
    mockUpdateConsultationStatus.mockResolvedValue(undefined);
    useAuthStore.setState({ user: { id: 'expert1' } as never });
    await renderWithQuery(<ConsultationDetailScreen />);

    await fireEvent.press(await screen.findByText('Decline'));
    expect(await screen.findByText('Decline this request?')).toBeTruthy();
    expect(mockUpdateConsultationStatus).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByText('Decline request'));
    await waitFor(() => expect(mockUpdateConsultationStatus).toHaveBeenCalledWith('c1', 'rejected'));
  });

  it('keeps the request when the expert backs out of declining', async () => {
    setup();
    useAuthStore.setState({ user: { id: 'expert1' } as never });
    await renderWithQuery(<ConsultationDetailScreen />);

    await fireEvent.press(await screen.findByText('Decline'));
    await fireEvent.press(await screen.findByText('Keep the request'));
    expect(mockUpdateConsultationStatus).not.toHaveBeenCalled();
  });

  it('asks the requester before cancelling, then cancels', async () => {
    setup();
    mockUpdateConsultationStatus.mockResolvedValue(undefined);
    useAuthStore.setState({ user: { id: 'requester1' } as never });
    await renderWithQuery(<ConsultationDetailScreen />);

    await fireEvent.press(await screen.findByText('Cancel request'));
    expect(await screen.findByText('Cancel this request?')).toBeTruthy();
    expect(mockUpdateConsultationStatus).not.toHaveBeenCalled();

    // The pinned button and the sheet's confirm share a name; the sheet sits in the screen body, ahead of the footer.
    await fireEvent.press(screen.getAllByText('Cancel request')[0]!);
    await waitFor(() => expect(mockUpdateConsultationStatus).toHaveBeenCalledWith('c1', 'cancelled'));
  });

  it('pins Mark resolved for a case in progress and offers a product recommendation', async () => {
    setup({ status: 'in_progress' });
    useAuthStore.setState({ user: { id: 'expert1' } as never });
    await renderWithQuery(<ConsultationDetailScreen />);

    expect(await screen.findByText('Mark resolved')).toBeTruthy();
    expect(screen.getByText('Recommend a product')).toBeTruthy();
  });

  it('shows a failed load with Try again instead of spinning forever', async () => {
    mockFetchConsultationById.mockRejectedValueOnce(new Error('Server unavailable'));
    mockFetchConsultationMessages.mockResolvedValue([]);
    mockFetchReviewByConsultationId.mockResolvedValue(null);
    mockResolveAttachmentUrls.mockResolvedValue({});
    useAuthStore.setState({ user: { id: 'expert1' } as never });
    await renderWithQuery(<ConsultationDetailScreen />);

    expect(await screen.findByText("Couldn't load this consultation")).toBeTruthy();
    expect(screen.getByText('Server unavailable')).toBeTruthy();

    mockFetchConsultationById.mockResolvedValue(consultation);
    await fireEvent.press(screen.getByText('Try again'));
    expect(await screen.findByText('Yellowing wheat leaves')).toBeTruthy();
  });

  it('replaces the composer with a closed notice, and offers no action, on a closed case', async () => {
    setup({ status: 'closed' });
    useAuthStore.setState({ user: { id: 'expert1' } as never });
    await renderWithQuery(<ConsultationDetailScreen />);

    expect(await screen.findByText('This consultation is closed')).toBeTruthy();
    expect(screen.queryByLabelText('Message')).toBeNull();
    expect(screen.queryByText('Recommend a product')).toBeNull();
    expect(screen.queryByText('Mark resolved')).toBeNull();
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

    await fireEvent.changeText(screen.getByLabelText('Message'), 'Please share a close-up photo');
    await fireEvent.press(screen.getByLabelText('Send message'));

    expect(mockSendConsultationMessage).toHaveBeenCalledWith('c1', 'Please share a close-up photo', []);
    expect(await screen.findByText('Please share a close-up photo')).toBeTruthy();
    // Written and spoken: who sent it.
    expect(screen.getByLabelText(/^You, .*: Please share a close-up photo$/)).toBeTruthy();
  });

  it('names the other person on their messages and separates the days', async () => {
    const message: ConsultationMessageWithListing = {
      id: 'm9',
      consultation_id: 'c1',
      sender_id: 'requester1',
      body: 'It started on Monday',
      attachments: [],
      recommended_listing_id: null,
      recommended_listing: null,
      created_at: '2020-01-05T09:00:00.000Z',
    };
    setup({}, [message]);
    useAuthStore.setState({ user: { id: 'expert1' } as never });
    await renderWithQuery(<ConsultationDetailScreen />);

    expect(await screen.findByText('It started on Monday')).toBeTruthy();
    expect(screen.getByLabelText(/^Ali Raza, .*: It started on Monday$/)).toBeTruthy();
    expect(await screen.findByText('5 Jan 2020')).toBeTruthy();
  });

  it('opens a photo from the case full screen', async () => {
    setup({ images: ['c1/u/leaf.jpg'] });
    mockResolveAttachmentUrls.mockResolvedValue({
      'c1/u/leaf.jpg': 'https://example.com/leaf.jpg',
    });
    useAuthStore.setState({ user: { id: 'expert1' } as never });
    await renderWithQuery(<ConsultationDetailScreen />);

    await fireEvent.press(await screen.findByLabelText('Photo 1 of 1 from Ali Raza'));
    expect(await screen.findByText('1 of 1')).toBeTruthy();
    expect(screen.getByLabelText('Close photos')).toBeTruthy();
  });

  it('starts a review unrated, and cannot submit until a star is chosen', async () => {
    setup({ status: 'resolved' });
    mockCreateConsultationReview.mockResolvedValue({
      id: 'r1',
      order_id: null,
      consultation_id: 'c1',
      listing_id: null,
      seller_id: 'expert1',
      buyer_id: 'requester1',
      rating: 4,
      comment: null,
      created_at: '2026-08-21T00:00:00.000Z',
    });
    useAuthStore.setState({ user: { id: 'requester1' } as never });
    await renderWithQuery(<ConsultationDetailScreen />);

    await fireEvent.press(await screen.findByText('Write a review'));
    expect(screen.getByRole('button', { name: 'Submit review' }).props.accessibilityState).toMatchObject({
      disabled: true,
    });
    await fireEvent.press(screen.getByText('Submit review'));
    expect(mockCreateConsultationReview).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('rating-star-4'));
    await fireEvent.press(screen.getByText('Submit review'));
    await waitFor(() => expect(mockCreateConsultationReview).toHaveBeenCalledWith('c1', 4, null));
  });

  it('lets the expert pick a product from a list and send it as a recommendation', async () => {
    setup({ status: 'in_progress' });
    mockFetchListings.mockResolvedValue([{ id: 'l1', title: 'Copper Fungicide' }]);
    mockSendConsultationMessage.mockResolvedValue({
      id: 'm2',
      consultation_id: 'c1',
      sender_id: 'expert1',
      body: 'Recommended: Copper Fungicide',
      attachments: [],
      recommended_listing_id: 'l1',
      recommended_listing: {
        id: 'l1',
        title: 'Copper Fungicide',
        price: 850,
        unit: 'bottle',
      },
      created_at: '2026-08-20T12:00:00.000Z',
    });
    useAuthStore.setState({ user: { id: 'expert1' } as never });
    await renderWithQuery(<ConsultationDetailScreen />);

    await fireEvent.press(await screen.findByText('Recommend a product'));
    expect(mockFetchListings).toHaveBeenCalledWith({});
    // Nothing to send until a product is chosen.
    expect(screen.getByRole('button', { name: 'Send recommendation' }).props.accessibilityState).toMatchObject({
      disabled: true,
    });
    await fireEvent.press(await screen.findByText('Copper Fungicide'));
    await fireEvent.press(screen.getByText('Send recommendation'));

    await waitFor(() =>
      expect(mockSendConsultationMessage).toHaveBeenCalledWith('c1', 'Recommended: Copper Fungicide', [], 'l1'),
    );
  });

  it('opens a recommended product on top of the Market tab, with Back kept (initial: false)', async () => {
    const message: ConsultationMessageWithListing = {
      id: 'm3',
      consultation_id: 'c1',
      sender_id: 'expert1',
      body: '',
      attachments: [],
      recommended_listing_id: 'l1',
      recommended_listing: {
        id: 'l1',
        title: 'Copper Fungicide',
        price: 850,
        unit: 'bottle',
      },
      created_at: '2026-08-20T12:00:00.000Z',
    };
    setup({}, [message]);
    const mockTabNavigate = jest.fn();
    mockGetParent.mockReturnValue({ navigate: mockTabNavigate });
    useAuthStore.setState({ user: { id: 'requester1' } as never });
    await renderWithQuery(<ConsultationDetailScreen />);

    await fireEvent.press(await screen.findByLabelText('Recommended listing: Copper Fungicide, Rs 850 per bottle'));
    expect(mockTabNavigate).toHaveBeenCalledWith(APP_TABS.Marketplace, {
      screen: MARKETPLACE_ROUTES.ListingDetail,
      params: { listingId: 'l1' },
      initial: false,
    });
  });
});
