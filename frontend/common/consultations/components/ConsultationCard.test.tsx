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
    await render(<ConsultationCard consultation={baseConsultation} counterpartyName="Dr. Ahsan" onPress={() => {}} />);
    expect(screen.getByText('Yellowing wheat leaves')).toBeTruthy();
    expect(screen.getByText('Requested')).toBeTruthy();
    expect(screen.getByText(/^Dr\. Ahsan · Wheat · /)).toBeTruthy();
    expect(screen.getByText('Medium priority')).toBeTruthy();
  });

  it('omits the crop suffix when the consultation has no crop', async () => {
    const consultation = { ...baseConsultation, crop: null };
    await render(<ConsultationCard consultation={consultation} counterpartyName="Dr. Ahsan" onPress={() => {}} />);
    expect(screen.getByText(/^Dr\. Ahsan · (?!Wheat)/)).toBeTruthy();
  });

  it('names the photos and says everything in one spoken label', async () => {
    const consultation = {
      ...baseConsultation,
      images: ['a.jpg', 'b.jpg'],
      priority: 'high' as const,
    };
    await render(<ConsultationCard consultation={consultation} counterpartyName="Ali Raza" onPress={() => {}} />);
    expect(screen.getByText(/2 photos/)).toBeTruthy();
    expect(
      screen.getByLabelText(/Yellowing wheat leaves, from Ali Raza, crop Wheat, High priority, .*, 2 photos/),
    ).toBeTruthy();
  });

  it('keeps the priority off a finished case', async () => {
    const consultation = { ...baseConsultation, status: 'resolved' as const };
    await render(<ConsultationCard consultation={consultation} counterpartyName="Dr. Ahsan" onPress={() => {}} />);
    expect(screen.queryByText('Medium priority')).toBeNull();
    expect(screen.getByText('Resolved')).toBeTruthy();
  });

  it('offers Accept and Decline on a request, with the spinner only on the pressed button', async () => {
    const onAccept = jest.fn();
    const onDecline = jest.fn();
    await render(
      <ConsultationCard
        consultation={baseConsultation}
        counterpartyName="Ali Raza"
        onPress={() => {}}
        actions={{ onAccept, onDecline, pending: 'accept' }}
      />,
    );
    // The status is not repeated on a queue of requests.
    expect(screen.queryByText('Requested')).toBeNull();
    expect(screen.getByRole('button', { name: 'Accept' }).props.accessibilityState).toMatchObject({ busy: true });
    expect(screen.getByRole('button', { name: 'Decline' }).props.accessibilityState).toMatchObject({
      busy: false,
      disabled: true,
    });
  });

  it('calls Accept and Decline', async () => {
    const onAccept = jest.fn();
    const onDecline = jest.fn();
    await render(
      <ConsultationCard
        consultation={baseConsultation}
        counterpartyName="Ali Raza"
        onPress={() => {}}
        actions={{ onAccept, onDecline }}
      />,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Accept' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Decline' }));
    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onDecline).toHaveBeenCalledTimes(1);
  });

  it('calls onPress when tapped', async () => {
    const onPress = jest.fn();
    await render(<ConsultationCard consultation={baseConsultation} counterpartyName="Dr. Ahsan" onPress={onPress} />);
    await fireEvent.press(screen.getByText('Yellowing wheat leaves'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
