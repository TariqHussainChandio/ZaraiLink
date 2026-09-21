import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import '../../localization';
import { ExpertDashboardScreen } from './DashboardScreen';
import { fetchExpertProfile } from '../../services/modules/expert/expertService';
import { fetchConsultationsForExpert } from '../../services/modules/expert/consultationService';
import { EXPERT_HOME_ROUTES, EXPERT_TABS, CONSULTATIONS_ROUTES } from '../../constants/routes';
import { useAuthStore } from '../../store/authStore';
import type { ConsultationWithRelations, ExpertWithProfile } from '../../types/expert';

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

jest.mock('../../services/modules/expert/expertService', () => ({
  fetchExpertProfile: jest.fn(),
}));
jest.mock('../../services/modules/expert/consultationService', () => ({
  fetchConsultationsForExpert: jest.fn(),
}));

const mockFetchExpertProfile = fetchExpertProfile as jest.Mock;
const mockFetchConsultationsForExpert = fetchConsultationsForExpert as jest.Mock;

const baseProfile: ExpertWithProfile = {
  id: 'expert1',
  qualifications: 'PhD Agronomy',
  degree: 'PhD',
  experience: '10 years',
  professional_description: 'Crop specialist',
  location: null,
  contact: '0300-0000000',
  verification_status: 'approved',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  profile: { id: 'expert1', full_name: 'Dr. Ahsan', avatar_url: null },
  expert_specializations: [{ specialization: 'plant_diseases' }],
};

const consultation: ConsultationWithRelations = {
  id: 'c1',
  user_id: 'u1',
  expert_id: 'expert1',
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
  expert: { id: 'expert1', full_name: 'Dr. Ahsan', avatar_url: null },
  crop: null,
};

describe('ExpertDashboardScreen', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockFetchExpertProfile.mockReset();
    mockFetchConsultationsForExpert.mockReset();
    useAuthStore.setState({ user: { id: 'expert1' } as never });
  });

  it('shows the profile-completion banner when there is no expert profile yet', async () => {
    mockFetchExpertProfile.mockResolvedValue(null);
    mockFetchConsultationsForExpert.mockResolvedValue([]);
    await render(<ExpertDashboardScreen />);

    expect(await screen.findByText('Complete your expert profile')).toBeTruthy();
    await fireEvent.press(screen.getByText('Complete your expert profile'));
    expect(mockNavigate).toHaveBeenCalledWith(EXPERT_HOME_ROUTES.ExpertApplication);
  });

  it('shows a pending-review banner while verification is pending', async () => {
    mockFetchExpertProfile.mockResolvedValue({ ...baseProfile, verification_status: 'pending' });
    mockFetchConsultationsForExpert.mockResolvedValue([]);
    await render(<ExpertDashboardScreen />);
    expect(await screen.findByText('Application pending review')).toBeTruthy();
  });

  it('shows a rejected banner and lets the expert re-apply', async () => {
    mockFetchExpertProfile.mockResolvedValue({ ...baseProfile, verification_status: 'rejected' });
    mockFetchConsultationsForExpert.mockResolvedValue([]);
    await render(<ExpertDashboardScreen />);

    await fireEvent.press(await screen.findByText('Application not approved'));
    expect(mockNavigate).toHaveBeenCalledWith(EXPERT_HOME_ROUTES.ExpertApplication);
  });

  it('renders open/resolved counts and recent consultation requests', async () => {
    mockFetchExpertProfile.mockResolvedValue(baseProfile);
    mockFetchConsultationsForExpert.mockResolvedValue([
      consultation,
      { ...consultation, id: 'c2', status: 'closed' },
    ]);
    await render(<ExpertDashboardScreen />);

    expect(await screen.findByText('Open Requests')).toBeTruthy();
    expect(screen.getByText('Resolved')).toBeTruthy();
    expect(screen.getAllByText('1')).toHaveLength(2);
    expect(screen.getAllByText('Yellowing wheat leaves')).toHaveLength(2);
  });

  it('navigates to Analytics via Quick Actions', async () => {
    mockFetchExpertProfile.mockResolvedValue(baseProfile);
    mockFetchConsultationsForExpert.mockResolvedValue([]);
    await render(<ExpertDashboardScreen />);

    await fireEvent.press(await screen.findByText('Analytics'));
    expect(mockNavigate).toHaveBeenCalledWith(EXPERT_HOME_ROUTES.Analytics);
  });

  it('navigates to the consultation detail screen when a card is tapped', async () => {
    mockFetchExpertProfile.mockResolvedValue(baseProfile);
    mockFetchConsultationsForExpert.mockResolvedValue([consultation]);
    await render(<ExpertDashboardScreen />);

    await fireEvent.press(await screen.findByText('Yellowing wheat leaves'));
    expect(mockNavigate).toHaveBeenCalledWith(EXPERT_TABS.Consultations, {
      screen: CONSULTATIONS_ROUTES.ConsultationDetail,
      params: { consultationId: 'c1' },
    });
  });

  it('shows the empty state when there are no consultation requests', async () => {
    mockFetchExpertProfile.mockResolvedValue(baseProfile);
    mockFetchConsultationsForExpert.mockResolvedValue([]);
    await render(<ExpertDashboardScreen />);
    expect(await screen.findByText('No requests yet')).toBeTruthy();
  });

  it('shows a retryable error state when loading fails', async () => {
    mockFetchExpertProfile.mockRejectedValue(new Error('network down'));
    mockFetchConsultationsForExpert.mockResolvedValue([]);
    await render(<ExpertDashboardScreen />);

    expect(await screen.findByText("Couldn't load the dashboard")).toBeTruthy();

    mockFetchExpertProfile.mockResolvedValue(baseProfile);
    await fireEvent.press(screen.getByText('Retry'));
    expect(await screen.findByText('No requests yet')).toBeTruthy();
  });
});
