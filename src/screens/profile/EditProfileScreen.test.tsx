import React from 'react';
import { Alert } from 'react-native';
import { launchImageLibraryAsync } from 'expo-image-picker';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
// EditProfileScreen calls useTranslation() but never imports '../../localization' itself —
// in the real app, App.tsx's own import of it runs the i18next init once at startup. A test
// that renders this screen in isolation needs the same side-effect import first.
import '../../localization';
import { EditProfileScreen } from './EditProfileScreen';
import { fetchFarmerProfile, upsertFarmerProfile } from '../../services/modules/farmer/farmService';
import { updateProfile, uploadAvatar } from '../../services/modules/profile/profileService';
import { useAuthStore } from '../../store/authStore';
import type { ProfileScreenProps } from '../../navigation/stacks/ProfileNavigator';
import type { Profile } from '../../types/profile';

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
}));

jest.mock('../../services/modules/farmer/farmService', () => ({
  fetchFarmerProfile: jest.fn(),
  upsertFarmerProfile: jest.fn(),
}));

jest.mock('../../services/modules/profile/profileService', () => ({
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
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('EditProfileScreen', () => {
  it('pre-fills the form from the current profile', async () => {
    useAuthStore.setState({ user: { id: 'user-1' } as never, profile: profile() });
    await render(<EditProfileScreen navigation={makeNavigation()} route={{} as never} />);

    expect(screen.getByDisplayValue('Ahmed Khan')).toBeTruthy();
    expect(screen.getByDisplayValue('+923001234567')).toBeTruthy();
    expect(screen.getByDisplayValue('Pakistan')).toBeTruthy();
  });

  it('does not show farmer-only fields or fetch the farmer profile for a buyer', async () => {
    useAuthStore.setState({ user: { id: 'user-1' } as never, profile: profile({ role: 'buyer' }) });
    await render(<EditProfileScreen navigation={makeNavigation()} route={{} as never} />);

    expect(screen.queryByLabelText('Experience')).toBeNull();
    expect(mockFetchFarmerProfile).not.toHaveBeenCalled();
  });

  it("shows and pre-fills farmer-only fields for a farmer", async () => {
    useAuthStore.setState({ user: { id: 'user-1' } as never, profile: profile({ role: 'farmer' }) });
    mockFetchFarmerProfile.mockResolvedValue({
      experience: '8 years',
      agricultural_info: 'Organic wheat farming',
    });
    await render(<EditProfileScreen navigation={makeNavigation()} route={{} as never} />);

    expect(await screen.findByDisplayValue('8 years')).toBeTruthy();
    expect(screen.getByDisplayValue('Organic wheat farming')).toBeTruthy();
  });

  it('saves the profile and navigates back on success', async () => {
    useAuthStore.setState({
      user: { id: 'user-1' } as never,
      profile: profile(),
      refreshProfile: jest.fn().mockResolvedValue(undefined),
    });
    const navigation = makeNavigation();
    await render(<EditProfileScreen navigation={navigation} route={{} as never} />);

    await fireEvent.changeText(screen.getByLabelText('Full name'), 'Ahmed Ali Khan');
    await fireEvent.press(screen.getByText('Save Changes'));

    await waitFor(() =>
      expect(mockUpdateProfile).toHaveBeenCalledWith(
        expect.objectContaining({ full_name: 'Ahmed Ali Khan', phone: '+923001234567' }),
      ),
    );
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('also upserts the farmer profile when saving as a farmer', async () => {
    useAuthStore.setState({
      user: { id: 'user-1' } as never,
      profile: profile({ role: 'farmer' }),
      refreshProfile: jest.fn().mockResolvedValue(undefined),
    });
    await render(<EditProfileScreen navigation={makeNavigation()} route={{} as never} />);
    await screen.findByText('Experience');

    await fireEvent.changeText(screen.getByLabelText('Experience'), '10 years');
    await fireEvent.press(screen.getByText('Save Changes'));

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
    await render(<EditProfileScreen navigation={makeNavigation()} route={{} as never} />);

    await fireEvent.press(screen.getByText('AK'));
    await fireEvent.press(screen.getByText('Save Changes'));

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

  it('shows an alert when saving fails', async () => {
    mockUpdateProfile.mockRejectedValue(new Error('Network error'));
    useAuthStore.setState({ user: { id: 'user-1' } as never, profile: profile() });
    const navigation = makeNavigation();
    await render(<EditProfileScreen navigation={navigation} route={{} as never} />);

    await fireEvent.press(screen.getByText('Save Changes'));

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith('Failed to update profile', 'Network error'),
    );
    expect(navigation.goBack).not.toHaveBeenCalled();
  });
});
