import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithProviders } from '../../testUtils/renderWithProviders';
import { ApprovalsScreen } from './ApprovalsScreen';
import { ADMIN_HOME_ROUTES } from '../../common/constants/routes';
import { fetchDealerApplications } from '../services/adminService';
import { fetchExpertsForAdmin } from '../../expert/services/expertService';

jest.mock('../services/adminService', () => ({ fetchDealerApplications: jest.fn() }));
jest.mock('../../expert/services/expertService', () => ({ fetchExpertsForAdmin: jest.fn() }));

function renderScreen(navigate = jest.fn()) {
  return renderWithProviders(<ApprovalsScreen navigation={{ navigate } as never} route={{} as never} />);
}

beforeEach(() => {
  jest.clearAllMocks();
  (fetchDealerApplications as jest.Mock).mockResolvedValue([
    {
      id: 'dealer-1',
      full_name: 'Dealer Bilal',
      account_status: 'pending',
      application_submitted_at: '2026-10-12T08:00:00Z',
      dealer_profile: { business_name: 'Hyderabad Agri Inputs' },
      dealer_documents: [],
    },
  ]);
  (fetchExpertsForAdmin as jest.Mock).mockResolvedValue([
    {
      id: 'expert-1',
      qualifications: 'MSc Plant Pathology',
      profile: { full_name: 'Dr Sana', account_status: 'pending', application_submitted_at: '2026-10-11T08:00:00Z' },
    },
  ]);
});

describe('ApprovalsScreen (SRDS §12)', () => {
  it('lists the dealers waiting for a decision, with their business, and opens one', async () => {
    const navigate = jest.fn();
    await renderScreen(navigate);
    expect(await screen.findByText('Dealer Bilal')).toBeTruthy();
    expect(screen.getByText(/Hyderabad Agri Inputs · Sent/)).toBeTruthy();
    expect(fetchDealerApplications).toHaveBeenCalledWith('pending');
    await fireEvent.press(screen.getByText('Dealer Bilal'));
    expect(navigate).toHaveBeenCalledWith(ADMIN_HOME_ROUTES.ApplicationDetail, { role: 'dealer', id: 'dealer-1' });
  });

  it('switches to experts and to decided applications', async () => {
    const navigate = jest.fn();
    await renderScreen(navigate);
    await screen.findByText('Dealer Bilal');
    await fireEvent.press(screen.getByRole('button', { name: 'Experts' }));
    expect(await screen.findByText('Dr Sana')).toBeTruthy();
    await fireEvent.press(screen.getByText('Dr Sana'));
    expect(navigate).toHaveBeenCalledWith(ADMIN_HOME_ROUTES.ApplicationDetail, { role: 'expert', id: 'expert-1' });

    await fireEvent.press(screen.getByRole('button', { name: 'Approved' }));
    expect(fetchExpertsForAdmin).toHaveBeenCalledWith('approved');
  });

  it('opens the required-documents list', async () => {
    const navigate = jest.fn();
    await renderScreen(navigate);
    await fireEvent.press(await screen.findByText('Required documents'));
    expect(navigate).toHaveBeenCalledWith(ADMIN_HOME_ROUTES.RequiredDocuments);
  });

  it('says when nothing is waiting', async () => {
    (fetchDealerApplications as jest.Mock).mockResolvedValue([]);
    await renderScreen();
    expect(await screen.findByText('No application is waiting')).toBeTruthy();
  });
});
