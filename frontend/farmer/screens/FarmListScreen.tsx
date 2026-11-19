import { useFocusEffect } from '@react-navigation/native';
import { Plus, Tractor } from 'lucide-react-native';
import React, { useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Button, Card, ScreenState } from '../../common/components';
import { HOME_ROUTES } from '../../common/constants/routes';
import { useFarms } from '../hooks/farmer';
import { useAuthStore } from '../../state/authStore';
import { useTheme, type Theme } from '../../theme';
import type { HomeScreenProps } from '../../navigation/stacks/HomeNavigator';

const AREA = new Intl.NumberFormat('en-PK', { maximumFractionDigits: 2 });

export function FarmListScreen({ navigation }: HomeScreenProps<'FarmList'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const userId = useAuthStore(state => state.user?.id);
  const farms = useFarms(!!userId);
  const { refetch } = farms;
  const newFarm = () => navigation.navigate(HOME_ROUTES.CreateFarm);

  useFocusEffect(
    useCallback(() => {
      if (userId) refetch();
    }, [userId, refetch]),
  );

  return (
    <View style={styles.container}>
      <ScreenState
        // A disabled query (no signed-in user) stays pending forever; it is not loading, so it must not show a skeleton.
        query={{ ...farms, isPending: farms.isPending && !!userId }}
        errorTitle="Couldn't load farms"
        empty={{
          title: 'No farms yet',
          description: 'Add your first farm to get started.',
          icon: Tractor,
        }}
      >
        {data => (
          <FlashList
            data={data}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => {
              const area = item.area ? `${AREA.format(item.area)} ${item.land_unit ?? ''}`.trim() : 'Area not set';
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${item.name}, ${area}`}
                  accessibilityHint="Opens this farm"
                  onPress={() => navigation.navigate(HOME_ROUTES.FarmDetail, { farmId: item.id })}
                  style={styles.row}
                >
                  <Card>
                    <Text style={styles.name}>{item.name}</Text>
                    <Text style={styles.meta}>{area}</Text>
                  </Card>
                </Pressable>
              );
            }}
          />
        )}
      </ScreenState>
      <Button label="New Farm" icon={Plus} size="lg" fullWidth={false} onPress={newFarm} style={styles.fab} />
    </View>
  );
}

function makeStyles({ colors, space, size, typography, shadows }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    list: {
      padding: space[4],
      paddingBottom: space[12] + size.touchMin,
    },
    row: {
      minHeight: size.touchMin,
      marginBottom: space[3],
    },
    name: {
      ...typography.bodyStrong,
      color: colors.ink,
    },
    meta: {
      marginTop: space[1] / 2,
      ...typography.caption,
      color: colors.ink2,
    },
    fab: {
      position: 'absolute',
      right: space[4],
      bottom: space[4],
      ...shadows.elev2,
    },
  });
}
