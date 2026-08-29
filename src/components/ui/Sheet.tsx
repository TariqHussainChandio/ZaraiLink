import React from 'react';
import { Modal, ModalProps, Pressable, StyleSheet, View } from 'react-native';
import { lightTheme } from '../../theme';

export interface SheetProps extends Pick<ModalProps, 'visible'> {
  onClose: () => void;
  children: React.ReactNode;
}

const { colors, spacing, radii } = lightTheme;

export function Sheet({ visible, onClose, children }: SheetProps) {
  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>{children}</View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    backgroundColor: colors.neutral.white,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    padding: spacing.xl,
  },
});
