import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { ADMIN_HOME_ROUTES } from '../../common/constants/routes';
import type { AdminScreenProps } from '../../navigation/stacks/AdminNavigator';
import { renderWithQuery } from '../../testUtils/renderWithProviders';
import { fetchAdminQueues } from '../services/adminService';
import { ModerationScreen } from './ModerationScreen';

jest.mock('../services/adminService', () => ({ fetchAdminQueues: jest.fn() }));
const mockQueues = fetchAdminQueues as jest.Mock;

function makeNavigation() {
  return { navigate: jest.fn() } as unknown as AdminScreenProps<'ModerationHub'>['navigation'];
}

beforeEach(() => {
  mockQueues.mockReset().mockResolvedValue({
    pending_dealer_applications: 0,
    pending_expert_applications: 0,
    open_reports: 3,
    disputed_orders: 0,
    stale_consultations: 2,
  });
});

describe('ModerationScreen', () => {
  it.each([
    ['Users', ADMIN_HOME_ROUTES.UserManagement],
    ['Listings', ADMIN_HOME_ROUTES.ListingModeration],
    ['Reports', ADMIN_HOME_ROUTES.Reports],
    ['Orders', ADMIN_HOME_ROUTES.Orders],
    ['Categories', ADMIN_HOME_ROUTES.Categories],
    ['Reference data', ADMIN_HOME_ROUTES.ReferenceData],
  ])('opens %s', async (title, route) => {
    const navigation = makeNavigation();
    await renderWithQuery(<ModerationScreen navigation={navigation} route={{} as never} />);
    await fireEvent.press(screen.getByRole('button', { name: new RegExp(`^${title},`) }));
    expect(navigation.navigate).toHaveBeenCalledWith(route);
  });

  it('shows what is waiting beside the queues, and nothing where nothing waits', async () => {
    await renderWithQuery(<ModerationScreen navigation={makeNavigation()} route={{} as never} />);
    expect(await screen.findByRole('button', { name: /^Reports, 3 open\./ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Consultations, 2 left open\./ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Orders, \d+ disputed/ })).toBeNull();
  });
});
