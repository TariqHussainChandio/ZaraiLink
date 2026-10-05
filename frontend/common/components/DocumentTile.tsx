import { FileText, Image as ImageIcon } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { type Theme, useTheme } from '../../theme';
import { Button } from './Button';

export interface DocumentTileProps {
  fileName: string;
  /** From Storage, e.g. "application/pdf" or "image/jpeg"; unknown while a file is still uploading. */
  mimeType?: string | null;
  sizeBytes?: number | null;
  onView?: () => void;
  onRemove?: () => void;
  /** Uploading or removing: the actions wait. */
  busy?: boolean;
}

// Intl rounds and groups the number for the reader's locale; the unit is a plain suffix, since Hermes on Android does
// not promise Intl's `unit` style.
const ONE_DECIMAL = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
const WHOLE = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

function formatFileSize(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${ONE_DECIMAL.format(bytes / (1024 * 1024))} MB`
    : `${WHOLE.format(Math.max(1, bytes / 1024))} KB`;
}

/** One attached file of an application (A3b): what it is, how big, and what can be done with it. */
export function DocumentTile({ fileName, mimeType, sizeBytes, onView, onRemove, busy = false }: DocumentTileProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const isImage = mimeType?.startsWith('image/') ?? false;
  const Icon = isImage ? ImageIcon : FileText;
  const kind = isImage ? 'Photo' : mimeType === 'application/pdf' ? 'PDF' : 'File';
  const meta = [kind, sizeBytes ? formatFileSize(sizeBytes) : null, busy ? 'Working…' : null].filter(Boolean).join(' · ');
  return (
    <View style={styles.tile}>
      <Icon color={theme.colors.ink2} size={theme.size.iconMd} strokeWidth={theme.size.iconStroke} />
      <View style={styles.text}>
        <Text style={styles.name} numberOfLines={1}>
          {fileName}
        </Text>
        <Text style={styles.meta}>{meta}</Text>
      </View>
      {onView ? (
        <Button label="View" variant="quiet" size="sm" fullWidth={false} disabled={busy} onPress={onView} accessibilityLabel={`View ${fileName}`} />
      ) : null}
      {onRemove ? (
        <Button label="Remove" variant="quiet" size="sm" fullWidth={false} disabled={busy} onPress={onRemove} accessibilityLabel={`Remove ${fileName}`} />
      ) : null}
    </View>
  );
}

function makeStyles({ colors, space, size, radius, borders, typography }: Theme) {
  return StyleSheet.create({
    tile: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[3],
      minHeight: size.row,
      paddingHorizontal: space[3],
      borderWidth: borders.hairline,
      borderColor: colors.line,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
    },
    text: { flex: 1, gap: space[1] },
    name: { ...typography.body, color: colors.ink },
    meta: { ...typography.caption, color: colors.ink3 },
  });
}
