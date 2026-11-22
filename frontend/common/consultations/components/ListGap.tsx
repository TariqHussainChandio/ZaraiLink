import React from 'react';
import { View } from 'react-native';
import { useTheme } from '../../../theme';

/** The space between two cards of a list (FlashList draws no gap of its own). */
export function ListGap() {
  const { space } = useTheme();
  return <View style={{ height: space[3] }} />;
}
