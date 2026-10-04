import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../../testUtils/renderWithProviders';
import { CreateAccountScreen } from './CreateAccountScreen';
import { AUTH_ROUTES } from '../../constants/routes';
import type { AuthScreenProps } from '../../../navigation/stacks/AuthNavigator';

function makeNavigation() {
  return { navigate: jest.fn() } as unknown as AuthScreenProps<'CreateAccount'>['navigation'];
}

describe('CreateAccountScreen (SRDS §4)', () => {
  it('offers the four public account types and no admin', async () => {
    await renderWithQuery(<CreateAccountScreen navigation={makeNavigation()} route={{} as never} />);
    for (const title of ['Farmer', 'Buyer', 'Dealer', 'Agricultural expert']) expect(screen.getByText(title)).toBeTruthy();
    expect(screen.queryByText(/Admin/)).toBeNull();
    expect(screen.getAllByText(/Reviewed by an administrator/)).toHaveLength(2);
  });

  it.each([
    ['Farmer', 'farmer'],
    ['Buyer', 'buyer'],
    ['Dealer', 'dealer'],
    ['Agricultural expert', 'expert'],
  ])('opens the %s form', async (title, role) => {
    const navigation = makeNavigation();
    await renderWithQuery(<CreateAccountScreen navigation={navigation} route={{} as never} />);
    await fireEvent.press(screen.getByText(title));
    expect(navigation.navigate).toHaveBeenCalledWith(AUTH_ROUTES.Register, { role });
  });
});
