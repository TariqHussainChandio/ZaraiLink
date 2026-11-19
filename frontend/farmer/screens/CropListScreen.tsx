import { useFocusEffect } from '@react-navigation/native';
import { Plus, Sprout } from 'lucide-react-native';
import React, { useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Button, Card, ScreenState } from '../../common/components';
import { HOME_ROUTES } from '../../common/constants/routes';
import { useFarmCrops } from '../hooks/farmer';
import { useTheme, type Theme } from '../../theme';
import type { HomeScreenProps } from '../../navigation/stacks/HomeNavigator';

export function CropListScreen({ route, navigation }: HomeScreenProps<'CropList'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { farmId } = route.params;
  const crops = useFarmCrops(farmId);
  const { refetch } = crops;
  const addCrop = () => navigation.navigate(HOME_ROUTES.AddCrop, { farmId });

  // Coming back from adding or editing a crop shows the change.
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  return (
    <View style={styles.container}>
      <ScreenState
        query={crops}
        errorTitle="Couldn't load crops"
        empty={{
          title: 'No crops recorded',
          description: 'Add the crops growing on this farm.',
          icon: Sprout,
        }}
      >
        {data => (
          <FlashList
            data={data}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => {
              const name = item.crop?.name ?? 'Unspecified crop';
              const details = [item.variety, item.growth_stage].filter(Boolean).join(' · ') || 'No details yet';
              const planted = item.planting_date ? `Planted ${item.planting_date}` : null;
              return (
                // The whole card is one target that TalkBack reads as the crop, its details and planting date.
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={[name, details, planted].filter(Boolean).join(', ')}
                  accessibilityHint="Opens this crop to edit it"
                  onPress={() => navigation.navigate(HOME_ROUTES.AddCrop, { farmId, cropId: item.id })}
                  style={styles.row}
                >
                  <Card>
                    <Text style={styles.name}>{name}</Text>
                    <Text style={styles.meta}>{details}</Text>
                    {planted ? <Text style={styles.meta}>{planted}</Text> : null}
                  </Card>
                </Pressable>
              );
            }}
          />
        )}
      </ScreenState>
      <Button label="Add Crop" icon={Plus} size="lg" fullWidth={false} onPress={addCrop} style={styles.fab} />
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
