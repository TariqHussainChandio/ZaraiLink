import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { EmptyState, Spinner } from '../../components/ui';
import { ExpertCard } from '../../components/features/expert/ExpertCard';
import { CONSULTATIONS_ROUTES } from '../../constants/routes';
import { fetchExperts } from '../../services/modules/expert/expertService';
import { lightTheme } from '../../theme';
import type { ExpertWithProfile } from '../../types/expert';
import type { ConsultationsScreenProps } from '../../navigation/stacks/ConsultationsNavigator';

const { colors, spacing } = lightTheme;

export function ExpertListScreen({ route, navigation }: ConsultationsScreenProps<'ExpertList'>) {
  const { specialization, prefill } = route.params ?? {};
  const [experts, setExperts] = useState<ExpertWithProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      fetchExperts({ specialization }).then(data => {
        if (!cancelled) {
          setExperts(data);
          setLoading(false);
        }
      }).catch(err => {
        console.warn('[ExpertListScreen] failed to load experts:', err);
        if (!cancelled) setLoading(false);
      });
      return () => {
        cancelled = true;
      };
    }, [specialization]),
  );

  if (loading) return <Spinner fullscreen />;

  return (
    <View style={styles.container}>
      <FlatList
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
          <EmptyState title="No verified experts yet" description="Check back soon for available experts." />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.neutral.white,
  },
  list: {
    padding: spacing.lg,
  },
});
