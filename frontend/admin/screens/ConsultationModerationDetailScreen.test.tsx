import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../testUtils/renderWithProviders';
import { ConsultationModerationDetailScreen } from './ConsultationModerationDetailScreen';
import { fetchConsultationForAdmin, moderateConsultation } from '../services/adminService';
import type { ConsultationDetail } from '../types/consultations';
import { ApiError } from '../../services/api/errors';
import { ADMIN_HOME_ROUTES } from '../../common/constants/routes';
import type { AdminScreenProps } from '../../navigation/stacks/AdminNavigator';

jest.mock('../services/adminService', () => ({
  fetchConsultationForAdmin: jest.fn(),
  moderateConsultation: jest.fn(),
}));

const mockFetch = fetchConsultationForAdmin as jest.Mock;
const mockModerate = moderateConsultation as jest.Mock;

const consultation = (overrides: Partial<ConsultationDetail> = {}): ConsultationDetail => ({
  id: 'c-1',
  user_id: 'farmer-1',
  expert_id: 'expert-1',
  crop_id: 'crop-1',
  farm_id: null,
  subject: 'Yellow leaves on wheat',
  problem_description: 'The lower leaves turn yellow',
  priority: 'medium',
  status: 'requested',
  images: [],
  moderation_reason: null,
  created_at: '2026-10-01T10:00:00Z',
  updated_at: '2026-10-02T10:00:00Z',
  user: { id: 'farmer-1', full_name: 'Farmer Sana' },
  expert: { id: 'expert-1', full_name: 'Dr Expert' },
  crop: { id: 'crop-1', name: 'Wheat' },
  ai_report: null,
  ...overrides,
});

const props = {
  navigation: { navigate: jest.fn() },
  route: { params: { consultationId: 'c-1' } },
} as unknown as AdminScreenProps<typeof ADMIN_HOME_ROUTES.ConsultationModerationDetail>;

beforeEach(() => {
  mockFetch.mockReset();
  mockModerate.mockReset();
});

describe('ConsultationModerationDetailScreen', () => {
  it('shows who asked whom about what', async () => {
    mockFetch.mockResolvedValue(consultation());
    await renderWithQuery(<ConsultationModerationDetailScreen {...props} />);

    expect(await screen.findByText('Yellow leaves on wheat')).toBeTruthy();
    expect(mockFetch).toHaveBeenCalledWith('c-1');
    expect(screen.getByText('Farmer: Farmer Sana')).toBeTruthy();
    expect(screen.getByText('Expert: Dr Expert')).toBeTruthy();
    expect(screen.getByText('Crop: Wheat')).toBeTruthy();
    expect(screen.getByText('The lower leaves turn yellow')).toBeTruthy();
  });

  it('shows the AI report it started from as advisory (BR-13)', async () => {
    mockFetch.mockResolvedValue(
      consultation({
        disease_case_id: 'case-1',
        ai_report: {
          case_id: 'case-1',
          report: {
            class_label: 'Wheat___Rust',
            crop: 'Wheat',
            disease: 'Rust',
            predicted_disease: 'Rust',
            is_healthy: false,
            confidence_band: 'low',
            confidence_score: 0.4,
            advisory: 'Ask an expert.',
            disclaimer: 'This is advice, not a diagnosis.',
            review_status: 'reviewed',
            created_at: '2026-10-01T09:00:00Z',
          },
        },
      }),
    );
    await renderWithQuery(<ConsultationModerationDetailScreen {...props} />);

    expect(await screen.findByText('Wheat: Rust')).toBeTruthy();
    expect(screen.getByText('Low-confidence result')).toBeTruthy();
    expect(screen.getByText('This is advice, not a diagnosis.')).toBeTruthy();
  });

  it('closes a consultation only with a reason', async () => {
    mockFetch.mockResolvedValueOnce(consultation()).mockResolvedValue(consultation({ status: 'closed', moderation_reason: 'Duplicate' }));
    mockModerate.mockResolvedValue(consultation({ status: 'closed', moderation_reason: 'Duplicate' }));
    await renderWithQuery(<ConsultationModerationDetailScreen {...props} />);
    await screen.findByText('Yellow leaves on wheat');

    await fireEvent.press(screen.getByText('Close'));
    await fireEvent.press(screen.getByText('Close consultation'));
    expect(screen.getByText('Say why, for the farmer and the expert')).toBeTruthy();
    expect(mockModerate).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByLabelText('Reason'), ' Duplicate ');
    await fireEvent.press(screen.getByText('Close consultation'));

    expect(mockModerate).toHaveBeenCalledWith('c-1', { action: 'close', reason: 'Duplicate' });
    expect(await screen.findByText('Consultation closed')).toBeTruthy();
    expect(await screen.findByText("Admin's reason")).toBeTruthy();
    expect(screen.getByText('Duplicate')).toBeTruthy();
    // No longer open: nothing more to moderate.
    expect(screen.queryByText('Cancel')).toBeNull();
  });

  it('cancels a consultation with a reason', async () => {
    mockFetch.mockResolvedValue(consultation({ status: 'accepted' }));
    mockModerate.mockResolvedValue(consultation({ status: 'cancelled' }));
    await renderWithQuery(<ConsultationModerationDetailScreen {...props} />);
    await screen.findByText('Yellow leaves on wheat');

    await fireEvent.press(screen.getByText('Cancel'));
    await fireEvent.changeText(screen.getByLabelText('Reason'), 'Abusive messages');
    await fireEvent.press(screen.getByText('Cancel consultation'));

    expect(mockModerate).toHaveBeenCalledWith('c-1', { action: 'cancel', reason: 'Abusive messages' });
    expect(await screen.findByText('Consultation cancelled')).toBeTruthy();
  });

  it.each(['closed', 'cancelled', 'rejected', 'expired'] as const)('offers no moderation once it is %s', async status => {
    mockFetch.mockResolvedValue(consultation({ status }));
    await renderWithQuery(<ConsultationModerationDetailScreen {...props} />);
    await screen.findByText('Yellow leaves on wheat');

    expect(screen.queryByText('Close')).toBeNull();
    expect(screen.queryByText('Cancel')).toBeNull();
  });

  it('shows a refusal in the banner', async () => {
    mockFetch.mockResolvedValue(consultation());
    mockModerate.mockRejectedValue(new ApiError({ status: 403, code: 'mfa_required', kind: 'forbidden', message: 'MFA required' }));
    await renderWithQuery(<ConsultationModerationDetailScreen {...props} />);
    await screen.findByText('Yellow leaves on wheat');

    await fireEvent.press(screen.getByText('Close'));
    await fireEvent.changeText(screen.getByLabelText('Reason'), 'Duplicate');
    await fireEvent.press(screen.getByText('Close consultation'));

    expect(await screen.findByText('This action needs two-step verification.')).toBeTruthy();
  });
});
