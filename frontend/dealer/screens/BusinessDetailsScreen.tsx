import { useNavigation } from '@react-navigation/native';
import React, { useMemo } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { DealerBusinessStep } from '../../common/auth';
import { useToast } from '../../common/components';
import { useTheme, type Theme } from '../../theme';

/** An approved dealer's business details (SRDS §7), the same form as the application's business step. */
export function BusinessDetailsScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const navigation = useNavigation();
  const toast = useToast();
  const onDone = () => {
    toast.success('Business details saved');
    navigation.goBack();
  };
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <DealerBusinessStep submitLabel="Save" onDone={onDone} />
    </ScrollView>
  );
}

function makeStyles({ colors, space }: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.surface },
    content: { padding: space[4] },
  });
}
