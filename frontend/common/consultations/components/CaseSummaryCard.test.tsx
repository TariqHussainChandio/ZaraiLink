import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { CaseSummaryCard } from './CaseSummaryCard';
import type { ConsultationWithRelations } from '../../../expert/types/expert';

const consultation: ConsultationWithRelations = {
  id: 'c1',
  user_id: 'u1',
  expert_id: 'e1',
  subject: 'Yellow leaves on wheat',
  crop_id: 'crop1',
  problem_description: 'Yellow streaks since Monday.',
  farm_id: null,
  images: ['a.jpg', 'b.jpg'],
  priority: 'high',
  status: 'in_progress',
  created_at: '2026-08-20T10:00:00.000Z',
  updated_at: '2026-08-20T10:00:00.000Z',
  user: { id: 'u1', full_name: 'Ali Raza', avatar_url: null },
  expert: { id: 'e1', full_name: 'Dr Ahsan', avatar_url: null },
  crop: { id: 'crop1', name: 'Wheat' },
};

const urls = ['https://example.com/a.jpg', 'https://example.com/b.jpg'];

describe('CaseSummaryCard', () => {
  it("shows the requester's words under their name, with status and priority in words", async () => {
    await render(
      <CaseSummaryCard
        consultation={consultation}
        counterpartyName="Ali Raza"
        photoUrls={urls}
        onOpenPhoto={() => {}}
      />,
    );
    expect(screen.getByText('In progress')).toBeTruthy();
    expect(screen.getByText('High priority')).toBeTruthy();
    expect(screen.getByText("Ali Raza's description")).toBeTruthy();
    expect(screen.getByText('Yellow streaks since Monday.')).toBeTruthy();
    expect(screen.getByText('With Ali Raza · Wheat')).toBeTruthy();
  });

  it('opens the photo that was tapped', async () => {
    const onOpenPhoto = jest.fn();
    await render(
      <CaseSummaryCard
        consultation={consultation}
        counterpartyName="Ali Raza"
        photoUrls={urls}
        onOpenPhoto={onOpenPhoto}
      />,
    );
    await fireEvent.press(screen.getByLabelText('Photo 2 of 2 from Ali Raza'));
    expect(onOpenPhoto).toHaveBeenCalledWith(1);
  });

  it("shows the AI suggestion in its own block, apart from the requester's words, only when there is one", async () => {
    const { rerender } = await render(
      <CaseSummaryCard
        consultation={consultation}
        counterpartyName="Ali Raza"
        photoUrls={urls}
        onOpenPhoto={() => {}}
      />,
    );
    expect(screen.queryByText(/AI suggestion/)).toBeNull();

    await rerender(
      <CaseSummaryCard
        consultation={consultation}
        counterpartyName="Ali Raza"
        photoUrls={urls}
        onOpenPhoto={() => {}}
        ai={{ label: 'Leaf rust', confidence: 0.73 }}
      />,
    );
    expect(screen.getByText("AI suggestion, not an expert's assessment")).toBeTruthy();
    expect(screen.getByText('Leaf rust, likely (73%)')).toBeTruthy();
    expect(screen.getByText('Yellow streaks since Monday.')).toBeTruthy();
  });

  it('folds to the header and says it is expanded or not', async () => {
    await render(
      <CaseSummaryCard
        consultation={consultation}
        counterpartyName="Ali Raza"
        photoUrls={urls}
        onOpenPhoto={() => {}}
      />,
    );
    const toggle = screen.getByRole('button', {
      name: 'Yellow leaves on wheat, case details',
    });
    expect(toggle.props.accessibilityState).toMatchObject({ expanded: true });
    await fireEvent.press(toggle);
    expect(screen.queryByText('Yellow streaks since Monday.')).toBeNull();
    expect(
      screen.getByRole('button', {
        name: 'Yellow leaves on wheat, case details',
      }).props.accessibilityState,
    ).toMatchObject({
      expanded: false,
    });
  });
});
