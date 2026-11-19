import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ConsultationCard, requestAge } from './ConsultationCard';
import type { ConsultationWithRelations } from '../../../expert/types/expert';

const baseConsultation: ConsultationWithRelations = {
  id: 'c1',
  user_id: 'u1',
  expert_id: 'e1',
  subject: 'Yellowing wheat leaves',
  crop_id: 'crop1',
  problem_description: 'Leaves are turning yellow near the base.',
  farm_id: null,
  images: [],
  priority: 'medium',
  status: 'requested',
  created_at: '2026-08-20T10:00:00.000Z',
  updated_at: '2026-08-20T10:00:00.000Z',
  user: { id: 'u1', full_name: 'Ali Raza', avatar_url: null },
  expert: { id: 'e1', full_name: 'Dr. Ahsan', avatar_url: null },
  crop: { id: 'crop1', name: 'Wheat' },
};

describe('ConsultationCard', () => {
  it('renders the subject, status, and counterparty with crop name', async () => {
    await render(
      <ConsultationCard consultation={baseConsultation} counterpartyName="Dr. Ahsan" onPress={() => {}} />,
    );
    expect(screen.getByText('Yellowing wheat leaves')).toBeTruthy();
    expect(screen.getByText('Requested')).toBeTruthy();
    expect(screen.getByText('Dr. Ahsan · Wheat')).toBeTruthy();
  });

  it('says "Crop not given" when the consultation has no crop (A8, E1)', async () => {
    const consultation = { ...baseConsultation, crop: null };
    await render(<ConsultationCard consultation={consultation} counterpartyName="Dr. Ahsan" onPress={() => {}} />);
    expect(screen.getByText('Dr. Ahsan · Crop not given')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Dr\. Ahsan, Crop not given\./ })).toBeTruthy();
  });

  it('shows how long ago the request was made, in the row and its label (A8, E1)', async () => {
    jest.useFakeTimers({ now: new Date('2026-08-22T12:00:00.000Z') });
    try {
      await render(<ConsultationCard consultation={baseConsultation} counterpartyName="Dr. Ahsan" onPress={() => {}} />);
      expect(screen.getByText(/^2 days ago · /)).toBeTruthy();
      expect(screen.getByRole('button', { name: /2 days ago, / })).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });

  it('words the age at each scale', () => {
    const now = new Date('2026-08-20T10:00:00.000Z');
    expect(requestAge('2026-08-20T09:59:30.000Z', now)).toBe('Just now');
    expect(requestAge('2026-08-20T09:59:00.000Z', now)).toBe('1 minute ago');
    expect(requestAge('2026-08-20T07:00:00.000Z', now)).toBe('3 hours ago');
    expect(requestAge('2026-08-19T10:00:00.000Z', now)).toBe('1 day ago');
    expect(requestAge('2026-06-20T10:00:00.000Z', now)).toBe('2 months ago');
    expect(requestAge('2024-08-20T10:00:00.000Z', now)).toBe('2 years ago');
  });

  it('calls onPress when tapped', async () => {
    const onPress = jest.fn();
    await render(<ConsultationCard consultation={baseConsultation} counterpartyName="Dr. Ahsan" onPress={onPress} />);
    await fireEvent.press(screen.getByText('Yellowing wheat leaves'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
