import type { NativeStackNavigationOptions, NativeStackScreenProps } from '@react-navigation/native-stack';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { type ParamListBase, useNavigation } from '@react-navigation/native';
import { ArrowLeft } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { IconButton } from '../../common/components';
import { ProfilePhoto } from '../../common/profile';
import { type Theme, useTheme } from '../../theme';
import { PROFILE_ROUTES } from '../../common/constants/routes';
import { BusinessDetailsScreen } from '../../dealer/screens/BusinessDetailsScreen';
import { ChangePasswordScreen } from '../../common/profile/screens/ChangePasswordScreen';
import { DeleteAccountScreen } from '../../common/profile/screens/DeleteAccountScreen';
import { EditProfileScreen } from '../../common/profile/screens/EditProfileScreen';
import { MfaEnrollmentScreen } from '../../common/profile/screens/MfaEnrollmentScreen';
import { SettingsScreen } from '../../common/profile/screens/SettingsScreen';
import { ViewProfileScreen } from '../../common/profile/screens/ViewProfileScreen';
import { DesignCatalogueScreen } from '../DesignCatalogueScreen';
import { designCatalogueAction } from '../headerActions';
import { stackOptionsWithActions } from '../stackHeader';

export type ProfileStackParamList = {
  [PROFILE_ROUTES.ViewProfile]: undefined;
  [PROFILE_ROUTES.EditProfile]: undefined;
  [PROFILE_ROUTES.Settings]: undefined;
  [PROFILE_ROUTES.ChangePassword]: undefined;
  [PROFILE_ROUTES.MfaEnrollment]: undefined;
  [PROFILE_ROUTES.BusinessDetails]: undefined;
  [PROFILE_ROUTES.DeleteAccount]: undefined;
  [PROFILE_ROUTES.DesignCatalogue]: undefined;
};

export type ProfileScreenProps<RouteName extends keyof ProfileStackParamList> =
  NativeStackScreenProps<ProfileStackParamList, RouteName>;

const Stack = createNativeStackNavigator<ProfileStackParamList>();

/** The Account's leading corner (D20): the person's photo (tap to view it or Edit photo), beside their name as the bar's
 * title. The admin, who has no bottom bar, gets Back to the Overview in front of it. */
function ProfileHeaderLeading({ back }: { back: boolean }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const tabs = useNavigation().getParent<BottomTabNavigationProp<ParamListBase>>();
  return (
    <View style={styles.leading}>
      {back ? <IconButton icon={ArrowLeft} label="Back to the Overview" onPress={() => tabs?.navigate('Home')} /> : null}
      <ProfilePhoto compact />
    </View>
  );
}
const profileLeading = () => <ProfileHeaderLeading back={false} />;
const adminProfileLeading = () => <ProfileHeaderLeading back />;

/** The Account's app bar (D20): photo and name, no "Account" title, no bell and no menu. Development builds keep the
 * design catalogue button, A2's evidence that every component follows the design system. */
export function profileStackOptions(adminBack = false): NativeStackNavigationOptions {
  return stackOptionsWithActions({ [PROFILE_ROUTES.ViewProfile]: designCatalogueAction }, 'marketplace', {
    [PROFILE_ROUTES.ViewProfile]: adminBack ? adminProfileLeading : profileLeading,
  });
}
const PROFILE_STACK_OPTIONS = profileStackOptions();

/** `screenOptions`: a shell's own app bar for the account screens (the admin's, with Back to the Overview, D20). */
export function ProfileNavigator({ screenOptions = PROFILE_STACK_OPTIONS }: { screenOptions?: NativeStackNavigationOptions }) {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name={PROFILE_ROUTES.ViewProfile}
        component={ViewProfileScreen}
        // The bar's title becomes the person's name (useNameTitle), beside their photo.
        options={{ title: 'Account', headerLargeTitle: false }}
      />
      <Stack.Screen
        name={PROFILE_ROUTES.EditProfile}
        component={EditProfileScreen}
        options={{ title: 'Edit profile' }}
      />
      <Stack.Screen
        name={PROFILE_ROUTES.Settings}
        component={SettingsScreen}
        options={{ title: 'Settings' }}
      />
      <Stack.Screen
        name={PROFILE_ROUTES.ChangePassword}
        component={ChangePasswordScreen}
        options={{ title: 'Change password' }}
      />
      <Stack.Screen
        name={PROFILE_ROUTES.MfaEnrollment}
        component={MfaEnrollmentScreen}
        options={{ title: 'Two-step verification' }}
      />
      <Stack.Screen
        name={PROFILE_ROUTES.BusinessDetails}
        component={BusinessDetailsScreen}
        options={{ title: 'Business details' }}
      />
      <Stack.Screen
        name={PROFILE_ROUTES.DeleteAccount}
        component={DeleteAccountScreen}
        options={{ title: 'Delete account' }}
      />
      {__DEV__ ? (
        <Stack.Screen name={PROFILE_ROUTES.DesignCatalogue} component={DesignCatalogueScreen} options={{ title: 'Design catalogue' }} />
      ) : null}
    </Stack.Navigator>
  );
}

function makeStyles({ space }: Theme) {
  return StyleSheet.create({
    leading: { flexDirection: 'row', alignItems: 'center', gap: space[1], paddingLeft: space[2] },
  });
}
