import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { EmptyState, Spinner } from '../../components/ui';
import { ExpertCard } from '../../components/features/expert/ExpertCard';
import { CONSULTATIONS_ROUTES } from '../../constants/routes';
import { fetchExperts } from '../../services/modules/expert/expertService';
import { useTheme, type Theme } from '../../theme';
import type { ExpertWithProfile } from '../../types/expert';
import type { ConsultationsScreenProps } from '../../navigation/stacks/ConsultationsNavigator';

export function ExpertListScreen({ route, navigation }: ConsultationsScreenProps<'ExpertList'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { specialization, prefill } = route.params ?? {};
  const [experts, setExperts] = useState<ExpertWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetchExperts({ specialization }).then(data => {
      if (!cancelled) {
        setExperts(data);
        setLoading(false);
      }
    }).catch(err => {
      console.warn('[ExpertListScreen] failed to load experts:', err);
      if (!cancelled) {
        setError(true);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [specialization]);

  useFocusEffect(useCallback(() => load(), [load]));

  if (loading) return <Spinner fullscreen />;
  if (error) {
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

function makeStyles({ colors, spacing }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background.surface,
    },
    list: {
      padding: spacing.lg,
    },
  });
}
