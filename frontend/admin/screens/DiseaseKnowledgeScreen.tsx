import { useFocusEffect } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BookOpen } from 'lucide-react-native';
import { type ChipOption, ChipRow, ListRow, ScreenState, StatusBadge } from '../../common/components';
import { ADMIN_HOME_ROUTES } from '../../common/constants/routes';
import type { AdminScreenProps } from '../../navigation/stacks/AdminNavigator';
import { useTheme, type Theme } from '../../theme';
import { useDiseaseKnowledge } from '../hooks/admin';

type Filter = 'all' | 'pending_review' | 'reviewed';
const FILTERS: ChipOption<Filter>[] = [
  { value: 'all', label: 'All' },
  { value: 'pending_review', label: 'Pending' },
  { value: 'reviewed', label: 'Reviewed' },
];

/**
 * The disease knowledge base the AI report reads (SRDS §37): one entry per class the model can predict. An entry stays
 * pending until a qualified agronomist reviews it; edits are audited by the API (BR-15).
 */
export function DiseaseKnowledgeScreen({ navigation }: AdminScreenProps<typeof ADMIN_HOME_ROUTES.DiseaseKnowledge>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const query = useDiseaseKnowledge();
  const { refetch } = query;
  const [filter, setFilter] = useState<Filter>('all');

  // An edit or a review on the entry's screen shows here on return.
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  const emptyTitle =
    filter === 'pending_review'
      ? 'No entry is waiting for review'
      : filter === 'reviewed'
        ? 'No entry has been reviewed yet'
        : 'No knowledge entries';

  return (
    <View style={styles.screen}>
      <View style={styles.filters}>
        <ChipRow options={FILTERS} value={filter} onChange={setFilter} />
        <Text style={styles.intro}>The AI report shows this text to farmers as advice; an agronomist reviews each entry.</Text>
      </View>
      <ScreenState
        query={query}
        errorTitle="Couldn't load the knowledge base"
        // The filter runs on this phone, so "empty" means nothing matches the chosen chip.
        isEmpty={data => !data.some(entry => filter === 'all' || entry.review_status === filter)}
        empty={{ title: emptyTitle, icon: BookOpen }}
      >
        {data => (
          <FlashList
            data={data
              .filter(entry => filter === 'all' || entry.review_status === filter)
              .sort((a, b) => a.crop.localeCompare(b.crop) || a.disease.localeCompare(b.disease))}
            keyExtractor={item => item.class_label}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <ListRow
                title={`${item.crop} — ${item.disease}`}
                meta={item.class_label}
                trailing={<StatusBadge kind="knowledge" status={item.review_status} size="sm" />}
                onPress={() => navigation.navigate(ADMIN_HOME_ROUTES.DiseaseKnowledgeEdit, { classLabel: item.class_label })}
              />
            )}
          />
        )}
      </ScreenState>
    </View>
  );
}

function makeStyles({ colors, space, typography }: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.surface },
    filters: { gap: space[2], paddingTop: space[3], paddingHorizontal: space[4] },
    intro: { ...typography.caption, color: colors.ink2 },
    list: { padding: space[4] },
  });
}
