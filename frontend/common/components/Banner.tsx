import { CircleAlert, CircleCheck, CircleX, Leaf, TriangleAlert, WifiOff, type LucideIcon } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { RoleScopeProvider, type Theme, useTheme } from '../../theme';
import { Button } from './Button';

/** advisory is for AI results (BR-13): it cannot be dismissed and its action leads to a verified expert. */
export type BannerTone = 'info' | 'success' | 'warning' | 'danger' | 'advisory' | 'offline';

const ICON: Record<BannerTone, LucideIcon> = {
  info: CircleAlert,
  success: CircleCheck,
  warning: TriangleAlert,
  danger: CircleX,
  advisory: Leaf,
  offline: WifiOff,
};

export interface BannerProps {
  tone?: BannerTone;
  title?: string;
  children?: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
}

/** A message about the whole screen, at its top: what happened and what to do next. The message is in `body` (16),
 * because people act on it. */
export function Banner({ tone = 'info', title, children, actionLabel, onAction }: BannerProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { fg, bg, mark } = toneColours(theme, tone);
  const Icon = ICON[tone];

  return (
    <View style={[styles.banner, { backgroundColor: bg }]}>
      <Icon color={mark} size={theme.size.iconMd} />
      <View style={styles.body}>
        {/* The title and message are one TalkBack stop (a failure is announced as an alert). The action is outside it:
            an `accessible` container around the whole banner swallowed the button for TalkBack. */}
        <View
          style={styles.message}
          accessible
          accessibilityRole={tone === 'danger' ? 'alert' : 'summary'}
          accessibilityLiveRegion={tone === 'danger' ? 'assertive' : 'polite'}
        >
          {title ? <Text style={[styles.title, { color: fg }]}>{title}</Text> : null}
          {typeof children === 'string' ? <Text style={[styles.text, { color: fg }]}>{children}</Text> : children}
        </View>
        {actionLabel && onAction ? (
          <View style={styles.action}>
            {tone === 'advisory' ? (
              // The AI advisory keeps the AI accent in every shell; any other banner's action takes the shell's accent.
              <RoleScopeProvider scope="ai">
                <Button label={actionLabel} onPress={onAction} variant="secondary" fullWidth={false} />
              </RoleScopeProvider>
            ) : (
              <Button label={actionLabel} onPress={onAction} variant="secondary" fullWidth={false} />
            )}
          </View>
        ) : null}
      </View>
    </View>
  );
}

function toneColours({ colors }: Theme, tone: BannerTone) {
  if (tone === 'advisory') return { fg: colors.accent.ai.ink, bg: colors.accent.ai.soft, mark: colors.accent.ai.mark };
  const t = colors.status[tone === 'offline' ? 'neutral' : tone === 'danger' ? 'danger' : tone];
  return { fg: t.ink, bg: t.soft, mark: t.mark };
}

function makeStyles({ space, components, typography }: Theme) {
  const { banner } = components;
  return StyleSheet.create({
    banner: { flexDirection: 'row', alignItems: 'flex-start', gap: banner.gap, padding: banner.padding, borderRadius: banner.radius },
    body: { flex: 1, gap: space[1] },
    message: { gap: space[1] },
    title: { ...typography.bodyStrong },
    text: { ...typography.body },
    action: { marginTop: space[2], alignSelf: 'flex-start' },
  });
}
