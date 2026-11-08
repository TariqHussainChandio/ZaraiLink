import React from 'react';
import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { renderWithQuery } from '../../testUtils/renderWithProviders';
import { ExpertDashboardScreen } from './DashboardScreen';
import { fetchExpertProfile } from '../services/expertService';
import {
  fetchConsultationsForExpert,
  updateConsultationStatus,
} from '../../common/consultations/services/consultationService';
import { EXPERT_HOME_ROUTES, EXPERT_TABS, CONSULTATIONS_ROUTES } from '../../common/constants/routes';
import { useAuthStore } from '../../state/authStore';
import type { ConsultationWithRelations, ExpertWithProfile } from '../types/expert';

const mockNavigate = jest.fn();
const mockTabNavigate = jest.fn();

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
    useNavigation: () => ({ navigate: mockNavigate, getParent: () => ({ navigate: mockTabNavigate }) }),
  };
});

jest.mock('../services/expertService', () => ({
  fetchExpertProfile: jest.fn(),
}));
jest.mock('../../common/consultations/services/consultationService', () => ({
  fetchConsultationsForExpert: jest.fn(),
  updateConsultationStatus: jest.fn(),
}));

const mockFetchExpertProfile = fetchExpertProfile as jest.Mock;
const mockFetchConsultationsForExpert = fetchConsultationsForExpert as jest.Mock;
const mockUpdateStatus = updateConsultationStatus as jest.Mock;

const baseProfile: ExpertWithProfile = {
  id: 'expert1',
  qualifications: 'PhD Agronomy',
  degree: 'PhD',
  experience: '10 years',
  professional_description: 'Crop specialist',
  location: null,
  contact: '0300-0000000',
  years_experience: null,
  institution_affiliation: null,
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
  crop_id: 'crop1',
  problem_description: null,
  farm_id: null,
  images: ['a.jpg', 'b.jpg'],
  priority: 'medium',
  status: 'requested',
  created_at: '2026-08-20T10:00:00.000Z',
  updated_at: '2026-08-20T10:00:00.000Z',
  user: { id: 'u1', full_name: 'Ali Raza', avatar_url: null },
  expert: { id: 'expert1', full_name: 'Dr. Ahsan', avatar_url: null },
  crop: { id: 'crop1', name: 'Wheat' },
};

describe('ExpertDashboardScreen', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockTabNavigate.mockReset();
    mockFetchExpertProfile.mockReset();
    mockFetchConsultationsForExpert.mockReset();
    mockUpdateStatus.mockReset();
    useAuthStore.setState({ user: { id: 'expert1' } as never });
  });

  it('shows the profile-completion banner when there is no expert profile yet', async () => {
    mockFetchExpertProfile.mockResolvedValue(null);
    mockFetchConsultationsForExpert.mockResolvedValue([]);
    await renderWithQuery(<ExpertDashboardScreen />);

    expect(await screen.findByText('Complete your expert profile')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Complete profile' }));
    expect(mockNavigate).toHaveBeenCalledWith(EXPERT_HOME_ROUTES.ExpertApplication);
  });

  it('shows a pending-review banner while verification is pending', async () => {
    mockFetchExpertProfile.mockResolvedValue({ ...baseProfile, verification_status: 'pending' });
    mockFetchConsultationsForExpert.mockResolvedValue([]);
    await renderWithQuery(<ExpertDashboardScreen />);
    expect(await screen.findByText('Application pending review')).toBeTruthy();
  });

  it('shows a rejected banner and lets the expert re-apply', async () => {
    mockFetchExpertProfile.mockResolvedValue({ ...baseProfile, verification_status: 'rejected' });
    mockFetchConsultationsForExpert.mockResolvedValue([]);
    await renderWithQuery(<ExpertDashboardScreen />);

    expect(await screen.findByText('Application not approved')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Update profile' }));
    expect(mockNavigate).toHaveBeenCalledWith(EXPERT_HOME_ROUTES.ExpertApplication);
  });

  it('counts only new requests as new, and keeps accepted and finished cases out of the list', async () => {
    mockFetchExpertProfile.mockResolvedValue(baseProfile);
    mockFetchConsultationsForExpert.mockResolvedValue([
      consultation,
      { ...consultation, id: 'c2', subject: 'Closed case', status: 'closed' },
      { ...consultation, id: 'c3', subject: 'Case in progress', status: 'in_progress' },
      { ...consultation, id: 'c4', subject: 'Accepted case', status: 'accepted' },
    ]);
    await renderWithQuery(<ExpertDashboardScreen />);

    expect(await screen.findByLabelText('New requests: 1')).toBeTruthy();
    expect(screen.getByLabelText('Active cases: 2')).toBeTruthy();
    expect(screen.getByLabelText('Resolved: 1')).toBeTruthy();
    expect(screen.getByText('Yellowing wheat leaves')).toBeTruthy();
    expect(screen.queryByText('Closed case')).toBeNull();
    expect(screen.queryByText('Case in progress')).toBeNull();
    expect(screen.queryByText('Accepted case')).toBeNull();
  });

  it('orders requests by priority, then by how long they have waited', async () => {
    mockFetchExpertProfile.mockResolvedValue(baseProfile);
    mockFetchConsultationsForExpert.mockResolvedValue([
      { ...consultation, id: 'a', subject: 'Low and old', priority: 'low', created_at: '2026-08-01T10:00:00.000Z' },
      { ...consultation, id: 'b', subject: 'High and new', priority: 'high', created_at: '2026-08-20T10:00:00.000Z' },
      { ...consultation, id: 'c', subject: 'High and old', priority: 'high', created_at: '2026-08-10T10:00:00.000Z' },
    ]);
    await renderWithQuery(<ExpertDashboardScreen />);

    await screen.findByText('High and old');
    const subjects = screen.getAllByText(/^(Low and old|High and new|High and old)$/).map(node => node.props.children);
    expect(subjects).toEqual(['High and old', 'High and new', 'Low and old']);
  });

  it('shows priority, crop and the photo count on each request', async () => {
    mockFetchExpertProfile.mockResolvedValue(baseProfile);
    mockFetchConsultationsForExpert.mockResolvedValue([{ ...consultation, priority: 'high' }]);
    await renderWithQuery(<ExpertDashboardScreen />);

    expect(await screen.findByText('High priority')).toBeTruthy();
    expect(screen.getByText(/^Ali Raza · Wheat · .* · 2 photos$/)).toBeTruthy();
  });

  it('accepts a request from its card and confirms it', async () => {
    mockFetchExpertProfile.mockResolvedValue(baseProfile);
    mockFetchConsultationsForExpert.mockResolvedValue([consultation]);
    mockUpdateStatus.mockResolvedValue(undefined);
    await renderWithQuery(<ExpertDashboardScreen />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Accept' }));
    await waitFor(() => expect(mockUpdateStatus).toHaveBeenCalledWith('c1', 'accepted'));
    expect(await screen.findByText('Request accepted from Ali Raza')).toBeTruthy();
  });

  it('asks before declining, and declines after the confirmation', async () => {
    mockFetchExpertProfile.mockResolvedValue(baseProfile);
    mockFetchConsultationsForExpert.mockResolvedValue([consultation]);
    mockUpdateStatus.mockResolvedValue(undefined);
    await renderWithQuery(<ExpertDashboardScreen />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Decline' }));
    expect(await screen.findByText('Decline this request?')).toBeTruthy();
    expect(mockUpdateStatus).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByText('Decline request'));
    await waitFor(() => expect(mockUpdateStatus).toHaveBeenCalledWith('c1', 'rejected'));
  });

  it('tells the expert when accepting fails, and leaves the request in the list', async () => {
    mockFetchExpertProfile.mockResolvedValue(baseProfile);
    mockFetchConsultationsForExpert.mockResolvedValue([consultation]);
    mockUpdateStatus.mockRejectedValue(new Error('Server unavailable'));
    await renderWithQuery(<ExpertDashboardScreen />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Accept' }));
    expect(await screen.findByText("Couldn't accept the request. Server unavailable")).toBeTruthy();
    expect(screen.getByText('Yellowing wheat leaves')).toBeTruthy();
  });

  it('navigates to Analytics via Quick Actions', async () => {
    mockFetchExpertProfile.mockResolvedValue(baseProfile);
    mockFetchConsultationsForExpert.mockResolvedValue([]);
    await renderWithQuery(<ExpertDashboardScreen />);

    await fireEvent.press(await screen.findByText('Analytics'));
    expect(mockNavigate).toHaveBeenCalledWith(EXPERT_HOME_ROUTES.Analytics);
  });

  it('opens the case on top of the Cases tab, with its list kept underneath', async () => {
    mockFetchExpertProfile.mockResolvedValue(baseProfile);
    mockFetchConsultationsForExpert.mockResolvedValue([consultation]);
    await renderWithQuery(<ExpertDashboardScreen />);

    await fireEvent.press(await screen.findByText('Yellowing wheat leaves'));
    expect(mockTabNavigate).toHaveBeenCalledWith(EXPERT_TABS.Consultations, {
      screen: CONSULTATIONS_ROUTES.ConsultationDetail,
      params: { consultationId: 'c1' },
      initial: false,
    });
  });

  it('shows the empty state when there are no new requests', async () => {
    mockFetchExpertProfile.mockResolvedValue(baseProfile);
    mockFetchConsultationsForExpert.mockResolvedValue([]);
    await renderWithQuery(<ExpertDashboardScreen />);
    expect(await screen.findByText('No new requests')).toBeTruthy();
  });

  it('shows an error banner with Try again, and "—" rather than zero, when loading fails', async () => {
    mockFetchExpertProfile.mockResolvedValue(baseProfile);
    mockFetchConsultationsForExpert.mockRejectedValue(new Error('network down'));
    await renderWithQuery(<ExpertDashboardScreen />);

    expect(await screen.findByText("Couldn't load your requests")).toBeTruthy();
    expect(screen.getByLabelText('New requests: not available')).toBeTruthy();

    mockFetchConsultationsForExpert.mockResolvedValue([consultation]);
    await fireEvent.press(screen.getByText('Try again'));
    expect(await screen.findByText('Yellowing wheat leaves')).toBeTruthy();
    expect(within(screen.getByLabelText('New requests: 1')).getByText('1')).toBeTruthy();
  });
});
