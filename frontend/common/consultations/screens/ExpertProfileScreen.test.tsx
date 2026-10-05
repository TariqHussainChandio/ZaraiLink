import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../../testUtils/renderWithProviders';
import { ExpertProfileScreen } from './ExpertProfileScreen';
import { fetchExpertById } from '../../../expert/services/expertService';
import { findOrCreateConversation } from '../../messaging/services/messagingService';
import { fetchReviewsForExpert } from '../../reviews/services/reviewsService';
import { APP_TABS, CONSULTATIONS_ROUTES, MESSAGING_ROUTES } from '../../constants/routes';
import { useAuthStore } from '../../../state/authStore';
import type { ExpertWithProfile } from '../../../expert/types/expert';
import type { ReviewWithBuyer } from '../../reviews/types/reviews';
import type { ConsultationsScreenProps } from '../../../navigation/stacks/ConsultationsNavigator';

const mockTabNavigate = jest.fn();
const mockGetParent = jest.fn(() => ({ navigate: mockTabNavigate }));

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({ getParent: mockGetParent }),
  };
});

jest.mock('../../../expert/services/expertService', () => ({
  fetchExpertById: jest.fn(),
}));
jest.mock('../../messaging/services/messagingService', () => ({
  findOrCreateConversation: jest.fn(),
}));
jest.mock('../../reviews/services/reviewsService', () => ({
  fetchReviewsForExpert: jest.fn(),
}));

const mockFetchExpertById = fetchExpertById as jest.Mock;
const mockFindOrCreateConversation = findOrCreateConversation as jest.Mock;
const mockFetchReviewsForExpert = fetchReviewsForExpert as jest.Mock;

const expert: ExpertWithProfile = {
  id: 'e1',
  qualifications: 'PhD Agronomy, 10 years extension work',
  degree: 'PhD Agronomy',
  experience: '10 years',
  professional_description: 'Focused on cereal crop diseases.',
  location: null,
  contact: '0300-0000000',
  years_experience: null,
  institution_affiliation: null,
  verification_status: 'approved',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  profile: { id: 'e1', full_name: 'Dr. Ahsan', avatar_url: null },
  expert_specializations: [{ specialization: 'plant_diseases' }, { specialization: 'irrigation' }],
};

const review: ReviewWithBuyer = {
  id: 'r1',
  order_id: null,
  consultation_id: 'c1',
  listing_id: null,
  seller_id: 'e1',
  buyer_id: 'u1',
  rating: 5,
  comment: 'Very helpful advice.',
  created_at: '2026-08-01T00:00:00.000Z',
  buyer: { id: 'u1', full_name: 'Ali Raza', avatar_url: null },
};

function makeProps(prefill?: unknown) {
  return {
    navigation: { navigate: jest.fn() },
    route: { params: { expertId: 'e1', prefill } },
  } as unknown as ConsultationsScreenProps<'ExpertProfile'>;
}

describe('ExpertProfileScreen', () => {
  beforeEach(() => {
    mockTabNavigate.mockReset();
    mockGetParent.mockClear();
    mockFetchExpertById.mockReset();
    mockFindOrCreateConversation.mockReset();
    mockFetchReviewsForExpert.mockReset();
    useAuthStore.setState({ user: { id: 'u1' } as never });
  });

  it('renders the expert profile with specializations and reviews', async () => {
    mockFetchExpertById.mockResolvedValue(expert);
    mockFetchReviewsForExpert.mockResolvedValue([review]);
    await renderWithQuery(<ExpertProfileScreen {...makeProps()} />);

    expect(await screen.findByText('Dr. Ahsan')).toBeTruthy();
    expect(screen.getByText('PhD Agronomy')).toBeTruthy();
    expect(screen.getByText('Plant Diseases, Irrigation')).toBeTruthy();
    expect(screen.getByText('Focused on cereal crop diseases.')).toBeTruthy();
    expect(screen.getByText('Very helpful advice.')).toBeTruthy();
    expect(screen.getByText('5.0 (1 review)')).toBeTruthy();
  });

  it('shows "No reviews yet" when the expert has no reviews', async () => {
    mockFetchExpertById.mockResolvedValue(expert);
    mockFetchReviewsForExpert.mockResolvedValue([]);
    await renderWithQuery(<ExpertProfileScreen {...makeProps()} />);
    expect(await screen.findByText('No reviews yet')).toBeTruthy();
  });

  it('shows a retryable error state when loading fails', async () => {
    mockFetchExpertById.mockRejectedValue(new Error('network down'));
    mockFetchReviewsForExpert.mockResolvedValue([]);
    await renderWithQuery(<ExpertProfileScreen {...makeProps()} />);

    expect(await screen.findByText("Couldn't load this expert")).toBeTruthy();

    mockFetchExpertById.mockResolvedValue(expert);
    await fireEvent.press(screen.getByText('Retry'));
    expect(await screen.findByText('Dr. Ahsan')).toBeTruthy();
  });

  it('navigates to RequestConsultation with the expert id and prefill', async () => {
    mockFetchExpertById.mockResolvedValue(expert);
    mockFetchReviewsForExpert.mockResolvedValue([]);
    const prefill = { subject: 'Yellow leaves', problemDescription: '', cropId: null, imageUrl: null };
    const props = makeProps(prefill);
    await renderWithQuery(<ExpertProfileScreen {...props} />);

    await fireEvent.press(await screen.findByText('Request Consultation'));
    expect(props.navigation.navigate).toHaveBeenCalledWith(CONSULTATIONS_ROUTES.RequestConsultation, {
      expertId: 'e1',
      prefill,
    });
  });

  it('starts or finds a conversation and opens it when "Message Expert" is pressed', async () => {
    mockFetchExpertById.mockResolvedValue(expert);
    mockFetchReviewsForExpert.mockResolvedValue([]);
    mockFindOrCreateConversation.mockResolvedValue({ id: 'conv1' });
    await renderWithQuery(<ExpertProfileScreen {...makeProps()} />);

    await fireEvent.press(await screen.findByText('Message Expert'));
    expect(mockFindOrCreateConversation).toHaveBeenCalledWith('e1');
    expect(mockTabNavigate).toHaveBeenCalledWith(APP_TABS.Messages, {
      screen: MESSAGING_ROUTES.Chat,
      initial: false,
      params: { conversationId: 'conv1', otherUserName: 'Dr. Ahsan' },
    });
  });
});
