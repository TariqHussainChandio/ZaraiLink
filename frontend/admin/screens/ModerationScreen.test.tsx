import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ADMIN_HOME_ROUTES } from '../../common/constants/routes';
import type { AdminScreenProps } from '../../navigation/stacks/AdminNavigator';
import { ModerationScreen } from './ModerationScreen';

function makeNavigation() {
  return { navigate: jest.fn() } as unknown as AdminScreenProps<'ModerationHub'>['navigation'];
}

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
    await render(<ModerationScreen navigation={navigation} route={{} as never} />);
    await fireEvent.press(screen.getByRole('button', { name: new RegExp(`^${title},`) }));
    expect(navigation.navigate).toHaveBeenCalledWith(route);
  });
});
