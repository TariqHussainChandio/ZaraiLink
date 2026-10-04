import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { EmptyState, Spinner } from '../../components';
import { ExpertCard } from '../components/ExpertCard';
import { CONSULTATIONS_ROUTES } from '../../constants/routes';
import { useExperts } from '../../../expert';
import { useTheme, type Theme } from '../../../theme';
import type { ConsultationsScreenProps } from '../../../navigation/stacks/ConsultationsNavigator';

export function ExpertListScreen({ route, navigation }: ConsultationsScreenProps<'ExpertList'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { specialization, prefill } = route.params ?? {};
  const { data: experts = [], isPending: loading, error, refetch } = useExperts(specialization);
  const load = () => refetch();

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  if (loading) return <Spinner fullscreen />;
  if (error && experts.length === 0) {
    return (
      <EmptyState
        title="Couldn't load experts"
        description="Check your connection and try again."
        actionLabel="Retry"
        onAction={load}
      />
    );
  }

  return (
    <View style={styles.container}>
      <FlashList
        data={experts}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <ExpertCard
            expert={item}
            onPress={() => navigation.navigate(CONSULTATIONS_ROUTES.ExpertProfile, { expertId: item.id, prefill })}
          />
        )}
        ListEmptyComponent={
          <EmptyState
            title="No verified experts yet"
            description="Check back soon for available experts."
          />
        }
      />
    </View>
  );
}

function makeStyles({ colors, space }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    list: {
      padding: space[4],
    },
  });
}
