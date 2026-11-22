import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Chip, QueryState, ScreenScaffold } from '../../components';
import { ListGap } from '../components/ListGap';
import { ExpertCard } from '../components/ExpertCard';
import { CONSULTATIONS_ROUTES } from '../../constants/routes';
import { SPECIALIZATION_LABELS } from '../../constants/labels';
import { useExperts } from '../../../expert';
import { useTheme, type Theme } from '../../../theme';
import type { ConsultationsScreenProps } from '../../../navigation/stacks/ConsultationsNavigator';

/** "Plant Diseases" as a sentence: "Plant diseases". */
const sentenceCase = (text: string) => text.charAt(0) + text.slice(1).toLowerCase();

/** The verified experts. From a plant scan the list starts narrowed to one specialisation; that filter is shown as a
 * chip that removes itself when tapped, and an empty narrowed list offers every expert (FA-25). */
export function ExpertListScreen({ route, navigation }: ConsultationsScreenProps<'ExpertList'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { specialization, prefill } = route.params ?? {};
  const query = useExperts(specialization);
  const { refetch } = query;
  const experts = query.data ?? [];

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  const showEveryone = () => navigation.setParams({ specialization: undefined });
  const filterName = specialization ? sentenceCase(SPECIALIZATION_LABELS[specialization]) : null;

  return (
    <ScreenScaffold scroll={false}>
      {filterName ? (
        <View style={styles.filter}>
          <Chip label={filterName} selected onPress={showEveryone} />
          <Text style={styles.filterHint}>Tap to see every expert</Text>
        </View>
      ) : null}
      <QueryState
        query={query}
        isEmpty={experts.length === 0}
        empty={
          filterName
            ? {
                title: `No verified experts for ${filterName.toLowerCase()} yet`,
                description: 'Every verified expert can still look at your photos.',
                actionLabel: 'See all experts',
                onAction: showEveryone,
              }
            : {
                title: 'No verified experts yet',
                description: 'Check back soon for available experts.',
              }
        }
        failureTitle="Couldn't load experts"
      >
        <View style={styles.list}>
          <FlashList
            data={experts}
            keyExtractor={item => item.id}
            ItemSeparatorComponent={ListGap}
            renderItem={({ item }) => (
              <ExpertCard
                expert={item}
                onPress={() =>
                  navigation.navigate(CONSULTATIONS_ROUTES.ExpertProfile, {
                    expertId: item.id,
                    prefill,
                  })
                }
              />
            )}
          />
        </View>
      </QueryState>
    </ScreenScaffold>
  );
}

function makeStyles({ colors, space, typography }: Theme) {
  return StyleSheet.create({
    list: { flex: 1 },
    filter: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[3],
      marginBottom: space[3],
    },
    filterHint: { ...typography.caption, flex: 1, color: colors.ink2 },
  });
}
