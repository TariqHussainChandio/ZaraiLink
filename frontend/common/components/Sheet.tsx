import React, { useMemo } from 'react';
import { Modal, ModalProps, Pressable, StyleSheet, View } from 'react-native';
import { useTheme, type Theme } from '../../theme';

export interface SheetProps extends Pick<ModalProps, 'visible'> {
  onClose: () => void;
  children: React.ReactNode;
}

export function Sheet({ visible, onClose, children }: SheetProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <Pressable testID="sheet-backdrop" style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>{children}</View>
    </Modal>
  );
}

function makeStyles({ colors, spacing, radii, shadows }: Theme) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.4)',
    },
    sheet: {
      backgroundColor: colors.background.surface,
      borderTopLeftRadius: radii.xl,
      borderTopRightRadius: radii.xl,
      padding: spacing.xl,
      // One depth tier above `Card` (shadows.sm) — a sheet floats over the whole screen, a
      // card sits flush within it, so the two should never read at the same elevation.
      ...shadows.md,
    },
  });
}
