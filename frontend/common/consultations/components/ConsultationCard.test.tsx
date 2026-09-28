import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ConsultationCard } from './ConsultationCard';
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

  it('omits the crop suffix when the consultation has no crop', async () => {
    const consultation = { ...baseConsultation, crop: null };
    await render(<ConsultationCard consultation={consultation} counterpartyName="Dr. Ahsan" onPress={() => {}} />);
    expect(screen.getByText('Dr. Ahsan')).toBeTruthy();
  });

  it('calls onPress when tapped', async () => {
    const onPress = jest.fn();
    await render(<ConsultationCard consultation={baseConsultation} counterpartyName="Dr. Ahsan" onPress={onPress} />);
    await fireEvent.press(screen.getByText('Yellowing wheat leaves'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
