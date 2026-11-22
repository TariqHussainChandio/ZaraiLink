import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../testUtils/renderWithProviders';
import { ConsultationModerationScreen } from './ConsultationModerationScreen';
import { fetchConsultationsForAdmin } from '../services/adminService';
import type { ConsultationWithRelations } from '../types/consultations';
import { ADMIN_HOME_ROUTES } from '../../common/constants/routes';
import type { AdminScreenProps } from '../../navigation/stacks/AdminNavigator';

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  const { useEffect } = jest.requireActual('react');
  return {
    ...actual,
    useFocusEffect: (effect: () => void) => useEffect(effect, [effect]),
  };
});

jest.mock('../services/adminService', () => ({
  fetchConsultationsForAdmin: jest.fn(),
}));

const mockFetch = fetchConsultationsForAdmin as jest.Mock;

const consultation = (overrides: Partial<ConsultationWithRelations> = {}): ConsultationWithRelations => ({
  id: 'c-1',
  user_id: 'farmer-1',
  expert_id: 'expert-1',
  crop_id: null,
  farm_id: null,
  subject: 'Yellow leaves on wheat',
  problem_description: 'The lower leaves turn yellow',
  priority: 'medium',
  status: 'requested',
  images: [],
  moderation_reason: null,
  created_at: '2026-10-01T10:00:00Z',
  updated_at: '2026-10-01T10:00:00Z',
  user: { id: 'farmer-1', full_name: 'Farmer Sana' },
  expert: { id: 'expert-1', full_name: 'Dr Expert' },
  ...overrides,
});

function makeProps(params?: { stale?: boolean }) {
  const navigation = { navigate: jest.fn() };
  return {
    navigation,
    props: { navigation, route: { params } } as unknown as AdminScreenProps<typeof ADMIN_HOME_ROUTES.ConsultationModeration>,
  };
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe('ConsultationModerationScreen', () => {
  it('lists every consultation with farmer, expert and status', async () => {
    mockFetch.mockResolvedValue([consultation()]);
    const { props } = makeProps();
    await renderWithQuery(<ConsultationModerationScreen {...props} />);

    expect(await screen.findByText('Yellow leaves on wheat')).toBeTruthy();
    expect(screen.getByText(/Farmer Sana → Dr Expert/)).toBeTruthy();
    expect(mockFetch).toHaveBeenCalledWith({ status: undefined, olderThanDays: undefined });
  });

  it('filters by status and by age on the server', async () => {
    mockFetch.mockResolvedValue([]);
    const { props } = makeProps();
    await renderWithQuery(<ConsultationModerationScreen {...props} />);
    await screen.findByText('No consultations here');

    await fireEvent.press(screen.getByText('In progress'));
    expect(mockFetch).toHaveBeenLastCalledWith({ status: 'in_progress', olderThanDays: undefined });

    await fireEvent.press(screen.getByText('Older than 7 days'));
    expect(mockFetch).toHaveBeenLastCalledWith({ status: 'in_progress', olderThanDays: 7 });
    expect(await screen.findByText('Nothing has been waiting for more than 7 days.')).toBeTruthy();
  });

  it("opens on the stale filter from the Overview's queue tile", async () => {
    mockFetch.mockResolvedValue([]);
    const { props } = makeProps({ stale: true });
    await renderWithQuery(<ConsultationModerationScreen {...props} />);

    await screen.findByText('No consultations here');
    expect(mockFetch).toHaveBeenCalledWith({ status: undefined, olderThanDays: 7 });
  });

  it('opens a consultation to moderate it', async () => {
    mockFetch.mockResolvedValue([consultation()]);
    const { navigation, props } = makeProps();
    await renderWithQuery(<ConsultationModerationScreen {...props} />);

    await fireEvent.press(await screen.findByText('Yellow leaves on wheat'));
    expect(navigation.navigate).toHaveBeenCalledWith(ADMIN_HOME_ROUTES.ConsultationModerationDetail, { consultationId: 'c-1' });
  });

  it('shows a retry state when the list cannot be loaded', async () => {
    mockFetch.mockRejectedValueOnce(new Error('offline')).mockResolvedValue([consultation()]);
    const { props } = makeProps();
    await renderWithQuery(<ConsultationModerationScreen {...props} />);

    expect(await screen.findByText("Couldn't load the consultations")).toBeTruthy();
    await fireEvent.press(screen.getByText('Retry'));
    expect(await screen.findByText('Yellow leaves on wheat')).toBeTruthy();
  });
});
