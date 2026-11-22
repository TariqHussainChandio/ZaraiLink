import React from 'react';
import { launchImageLibraryAsync } from 'expo-image-picker';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { createTestQueryClient, renderWithQuery } from '../../../testUtils/renderWithProviders';
import { queryKeys } from '../../../hooks/keys';
import { EditProfileScreen } from './EditProfileScreen';
import { fetchFarmerProfile, upsertFarmerProfile } from '../../../farmer/services/farmService';
import { updateProfile, uploadAvatar } from '../services/profileService';
import { useAuthStore } from '../../../state/authStore';
import type { ProfileScreenProps } from '../../../navigation/stacks/ProfileNavigator';
import type { Profile } from '../../types/profile';

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
}));

jest.mock('../../../farmer/services/farmService', () => ({
  fetchFarmerProfile: jest.fn(),
  upsertFarmerProfile: jest.fn(),
}));

jest.mock('../services/profileService', () => ({
  updateProfile: jest.fn(),
  uploadAvatar: jest.fn(),
}));

const mockLaunchImageLibrary = launchImageLibraryAsync as jest.Mock;
const mockFetchFarmerProfile = fetchFarmerProfile as jest.Mock;
const mockUpsertFarmerProfile = upsertFarmerProfile as jest.Mock;
const mockUpdateProfile = updateProfile as jest.Mock;
const mockUploadAvatar = uploadAvatar as jest.Mock;

const profile = (overrides: Partial<Profile> = {}): Profile =>
  ({
    id: 'user-1',
    role: 'buyer',
    full_name: 'Ahmed Khan',
    phone: '+923001234567',
    avatar_url: null,
    location: 'Multan, Punjab',
    country: 'Pakistan',
    province: 'Punjab',
    city: 'Multan',
    village: null,
    street: null,
    is_suspended: false,
    notifications_enabled: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }) as Profile;

function makeNavigation() {
  return { goBack: jest.fn() } as unknown as ProfileScreenProps<'EditProfile'>['navigation'];
}

beforeEach(() => {
  mockLaunchImageLibrary.mockReset();
  mockFetchFarmerProfile.mockReset().mockResolvedValue(null);
  mockUpsertFarmerProfile.mockReset().mockResolvedValue(undefined);
  mockUpdateProfile.mockReset().mockResolvedValue(undefined);
  mockUploadAvatar.mockReset();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('EditProfileScreen', () => {
  it('pre-fills the form from the current profile', async () => {
    useAuthStore.setState({ user: { id: 'user-1' } as never, profile: profile() });
    await renderWithQuery(<EditProfileScreen navigation={makeNavigation()} route={{} as never} />);

    expect(screen.getByDisplayValue('Ahmed Khan')).toBeTruthy();
    expect(screen.getByDisplayValue('+923001234567')).toBeTruthy();
    // The country is not a field; the province is chosen from a list and the city is typed.
    expect(screen.queryByLabelText('Country')).toBeNull();
    expect(screen.getByRole('button', { name: 'Province, Punjab' })).toBeTruthy();
    expect(screen.getByDisplayValue('Multan')).toBeTruthy();
  });

  it('does not show farmer-only fields or fetch the farmer profile for a buyer', async () => {
    useAuthStore.setState({ user: { id: 'user-1' } as never, profile: profile({ role: 'buyer' }) });
    await renderWithQuery(<EditProfileScreen navigation={makeNavigation()} route={{} as never} />);

    expect(screen.queryByLabelText('Experience')).toBeNull();
    expect(mockFetchFarmerProfile).not.toHaveBeenCalled();
  });

  it("shows and pre-fills farmer-only fields for a farmer", async () => {
    useAuthStore.setState({ user: { id: 'user-1' } as never, profile: profile({ role: 'farmer' }) });
    mockFetchFarmerProfile.mockResolvedValue({
      experience: '8 years',
      agricultural_info: 'Organic wheat farming',
    });
    await renderWithQuery(<EditProfileScreen navigation={makeNavigation()} route={{} as never} />);

    expect(await screen.findByDisplayValue('8 years')).toBeTruthy();
    expect(screen.getByDisplayValue('Organic wheat farming')).toBeTruthy();
  });

  it('does not overwrite what the farmer has typed when the farmer profile is refetched', async () => {
    const queryClient = createTestQueryClient();
    useAuthStore.setState({ user: { id: 'user-1' } as never, profile: profile({ role: 'farmer' }) });
    mockFetchFarmerProfile.mockResolvedValue({ experience: '8 years', agricultural_info: 'Organic wheat farming' });
    await renderWithQuery(<EditProfileScreen navigation={makeNavigation()} route={{} as never} />, queryClient);
    await screen.findByDisplayValue('8 years');

    await fireEvent.changeText(screen.getByLabelText('Experience'), '12 years');
    mockFetchFarmerProfile.mockResolvedValue({ experience: '9 years', agricultural_info: 'Changed elsewhere' });
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.profile.farmer() });
    });

    expect(screen.getByDisplayValue('12 years')).toBeTruthy();
    expect(screen.queryByDisplayValue('9 years')).toBeNull();
  });

  it('saves the profile and navigates back on success', async () => {
    useAuthStore.setState({
      user: { id: 'user-1' } as never,
      profile: profile(),
      refreshProfile: jest.fn().mockResolvedValue(undefined),
    });
    const navigation = makeNavigation();
    await renderWithQuery(<EditProfileScreen navigation={navigation} route={{} as never} />);

    await fireEvent.changeText(screen.getByLabelText('Full name'), 'Ahmed Ali Khan');
    await fireEvent.press(screen.getByText('Save profile'));

    await waitFor(() =>
      expect(mockUpdateProfile).toHaveBeenCalledWith(
        expect.objectContaining({ full_name: 'Ahmed Ali Khan', phone: '+923001234567', country: 'Pakistan', province: 'Punjab' }),
      ),
    );
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
    // A save the person can see worked, without an Alert.
    expect(await screen.findByText('Profile saved')).toBeTruthy();
  });

  it('also upserts the farmer profile when saving as a farmer', async () => {
    useAuthStore.setState({
      user: { id: 'user-1' } as never,
      profile: profile({ role: 'farmer' }),
      refreshProfile: jest.fn().mockResolvedValue(undefined),
    });
    await renderWithQuery(<EditProfileScreen navigation={makeNavigation()} route={{} as never} />);
    await screen.findByText('Experience');

    await fireEvent.changeText(screen.getByLabelText('Experience'), '10 years');
    await fireEvent.press(screen.getByText('Save profile'));

    await waitFor(() =>
      expect(mockUpsertFarmerProfile).toHaveBeenCalledWith({ experience: '10 years', agriculturalInfo: null }),
    );
  });

  it('picks and uploads a new avatar before saving', async () => {
    mockLaunchImageLibrary.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file://avatar.jpg', mimeType: 'image/jpeg', fileName: 'avatar.jpg' }],
    });
    mockUploadAvatar.mockResolvedValue('https://example.com/avatar.jpg');
    useAuthStore.setState({
      user: { id: 'user-1' } as never,
      profile: profile(),
      refreshProfile: jest.fn().mockResolvedValue(undefined),
    });
    await renderWithQuery(<EditProfileScreen navigation={makeNavigation()} route={{} as never} />);

    // The photo is a visible, named control: the avatar with a "Change photo" button beside it.
    await fireEvent.press(screen.getByRole('button', { name: 'Change photo' }));
    await fireEvent.press(screen.getByText('Save profile'));

    await waitFor(() =>
      expect(mockUploadAvatar).toHaveBeenCalledWith('user-1', {
        uri: 'file://avatar.jpg',
        mimeType: 'image/jpeg',
        fileName: 'avatar.jpg',
      }),
    );
    expect(mockUpdateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ avatar_url: 'https://example.com/avatar.jpg' }),
    );
  });

  it('shows a failed save as a banner on the screen, with the cause, and stays open', async () => {
    mockUpdateProfile.mockRejectedValue(new Error('Network error'));
    useAuthStore.setState({ user: { id: 'user-1' } as never, profile: profile() });
    const navigation = makeNavigation();
    await renderWithQuery(<EditProfileScreen navigation={navigation} route={{} as never} />);

    await fireEvent.press(screen.getByText('Save profile'));

    expect(await screen.findByText("Couldn't save your profile")).toBeTruthy();
    expect(screen.getByText('Network error')).toBeTruthy();
    expect(navigation.goBack).not.toHaveBeenCalled();
  });

  it('shows a photo that could not be chosen as a banner', async () => {
    mockLaunchImageLibrary.mockRejectedValue(new Error('Picker failed'));
    useAuthStore.setState({ user: { id: 'user-1' } as never, profile: profile() });
    await renderWithQuery(<EditProfileScreen navigation={makeNavigation()} route={{} as never} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Change photo' }));

    expect(await screen.findByText("Couldn't choose that photo")).toBeTruthy();
    expect(screen.getByText('Picker failed')).toBeTruthy();
  });

  it('refuses a phone number that is not a number, and says what to enter', async () => {
    useAuthStore.setState({ user: { id: 'user-1' } as never, profile: profile() });
    await renderWithQuery(<EditProfileScreen navigation={makeNavigation()} route={{} as never} />);

    await fireEvent.changeText(screen.getByLabelText('Phone'), '0300');
    await fireEvent.press(screen.getByText('Save profile'));

    expect((await screen.findAllByText('Enter a phone number like 0300 1234567')).length).toBeGreaterThan(0);
    expect(mockUpdateProfile).not.toHaveBeenCalled();
  });
});
