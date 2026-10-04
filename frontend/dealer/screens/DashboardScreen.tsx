import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { SellerDashboard } from '../../common/analytics';
import { useDealerApplication } from '../../common/auth';
import { Banner } from '../../common/components';
import { HOME_ROUTES } from '../../common/constants/routes';
import type { HomeStackParamList } from '../../navigation/stacks/HomeNavigator';
import { useTheme, type Theme } from '../../theme';

export function DealerDashboardScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  // A dealer approved before A3b sent no business details; they add them here (their own row stays editable once
  // approved, 20261012080000_applications.sql).
  const { data: business, isSuccess } = useDealerApplication();
  return (
    <View style={styles.screen}>
      {isSuccess && !business ? (
        <View style={styles.banner}>
          <Banner
            tone="info"
            title="Add your business details"
            actionLabel="Add details"
            onAction={() => navigation.navigate(HOME_ROUTES.BusinessDetails)}
          >
            Your business name, type, registration number and address.
          </Banner>
        </View>
      ) : null}
      <SellerDashboard />
    </View>
  );
}

function makeStyles({ space }: Theme) {
  return StyleSheet.create({
    screen: { flex: 1 },
    banner: { paddingHorizontal: space[4], paddingTop: space[3] },
  });
}
