import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../../testUtils/renderWithProviders';
import { ConsultationListScreen } from './ConsultationListScreen';
import { fetchConsultationsForExpert, fetchConsultationsForUser } from '../services/consultationService';
import { CONSULTATIONS_ROUTES } from '../../constants/routes';
import { useAuthStore } from '../../../state/authStore';
import type { ConsultationWithRelations } from '../../../expert/types/expert';

const mockNavigate = jest.fn();

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
    useNavigation: () => ({ navigate: mockNavigate }),
  };
});

jest.mock('../services/consultationService', () => ({
  fetchConsultationsForExpert: jest.fn(),
  fetchConsultationsForUser: jest.fn(),
}));

const mockFetchForExpert = fetchConsultationsForExpert as jest.Mock;
const mockFetchForUser = fetchConsultationsForUser as jest.Mock;

const consultation: ConsultationWithRelations = {
  id: 'c1',
  user_id: 'u1',
  expert_id: 'e1',
  subject: 'Yellowing wheat leaves',
  crop_id: null,
  problem_description: null,
  farm_id: null,
  images: [],
  priority: 'medium',
  status: 'requested',
  created_at: '2026-08-20T10:00:00.000Z',
  updated_at: '2026-08-20T10:00:00.000Z',
  user: { id: 'u1', full_name: 'Ali Raza', avatar_url: null },
  expert: { id: 'e1', full_name: 'Dr. Ahsan', avatar_url: null },
  crop: null,
};

describe('ConsultationListScreen', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockFetchForExpert.mockReset();
    mockFetchForUser.mockReset();
    useAuthStore.setState({
      user: { id: 'u1' } as never,
      role: 'farmer' as never,
    });
  });

  it('loads the requester’s own consultations and shows the expert as the counterparty', async () => {
    mockFetchForUser.mockResolvedValue([consultation]);
    await renderWithQuery(<ConsultationListScreen />);

    expect(await screen.findByText('Yellowing wheat leaves')).toBeTruthy();
    expect(screen.getByText(/^Dr\. Ahsan · /)).toBeTruthy();
    expect(mockFetchForUser).toHaveBeenCalledTimes(1);
    expect(mockFetchForExpert).not.toHaveBeenCalled();
  });

  it('loads assigned consultations and shows the requester as the counterparty for an expert', async () => {
    useAuthStore.setState({
      user: { id: 'e1' } as never,
      role: 'expert' as never,
    });
    mockFetchForExpert.mockResolvedValue([consultation]);
    await renderWithQuery(<ConsultationListScreen />);

    expect(await screen.findByText('Yellowing wheat leaves')).toBeTruthy();
    expect(screen.getByText(/^Ali Raza · /)).toBeTruthy();
    expect(mockFetchForExpert).toHaveBeenCalledTimes(1);
    expect(mockFetchForUser).not.toHaveBeenCalled();
  });

  it('navigates to the consultation detail screen when a card is tapped', async () => {
    mockFetchForUser.mockResolvedValue([consultation]);
    await renderWithQuery(<ConsultationListScreen />);

    await fireEvent.press(await screen.findByText('Yellowing wheat leaves'));
    expect(mockNavigate).toHaveBeenCalledWith(CONSULTATIONS_ROUTES.ConsultationDetail, { consultationId: 'c1' });
  });

  it('shows the requester empty state when there are no consultations', async () => {
    mockFetchForUser.mockResolvedValue([]);
    await renderWithQuery(<ConsultationListScreen />);
    expect(await screen.findByText('No consultations yet')).toBeTruthy();
  });

  it('leads a requester with no consultations to the verified experts', async () => {
    mockFetchForUser.mockResolvedValue([]);
    await renderWithQuery(<ConsultationListScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Find an expert' }));
    expect(mockNavigate).toHaveBeenCalledWith(CONSULTATIONS_ROUTES.ExpertList);
  });

  it('shows the expert empty state when there are no assigned requests', async () => {
    useAuthStore.setState({
      user: { id: 'e1' } as never,
      role: 'expert' as never,
    });
    mockFetchForExpert.mockResolvedValue([]);
    await renderWithQuery(<ConsultationListScreen />);
    expect(await screen.findByText('No consultation requests yet')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Find an expert' })).toBeNull();
  });

  it('shows a retryable error state when loading fails', async () => {
    mockFetchForUser.mockRejectedValue(new Error('network down'));
    await renderWithQuery(<ConsultationListScreen />);

    expect(await screen.findByText("Couldn't load consultations")).toBeTruthy();

    mockFetchForUser.mockResolvedValue([consultation]);
    await fireEvent.press(screen.getByText('Try again'));
    expect(await screen.findByText('Yellowing wheat leaves')).toBeTruthy();
  });

  it('lists active consultations first and finished ones under Resolved', async () => {
    mockFetchForUser.mockResolvedValue([
      consultation,
      {
        ...consultation,
        id: 'c2',
        subject: 'Rust on barley',
        status: 'resolved',
      },
      {
        ...consultation,
        id: 'c3',
        subject: 'Aphids on cotton',
        status: 'rejected',
      },
    ]);
    await renderWithQuery(<ConsultationListScreen />);

    expect(await screen.findByText('Yellowing wheat leaves')).toBeTruthy();
    expect(screen.queryByText('Rust on barley')).toBeNull();
    expect(screen.getByRole('button', { name: 'Active' }).props.accessibilityState).toMatchObject({ selected: true });

    await fireEvent.press(screen.getByRole('button', { name: 'Resolved' }));
    expect(await screen.findByText('Rust on barley')).toBeTruthy();
    expect(screen.getByText('Aphids on cotton')).toBeTruthy();
    expect(screen.queryByText('Yellowing wheat leaves')).toBeNull();
  });

  it('says so when a filter has nothing, instead of the first-time empty state', async () => {
    mockFetchForUser.mockResolvedValue([{ ...consultation, status: 'resolved' }]);
    await renderWithQuery(<ConsultationListScreen />);

    expect(await screen.findByText('Nothing active right now')).toBeTruthy();
    expect(screen.queryByText('No consultations yet')).toBeNull();
  });
});
