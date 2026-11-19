import React, { useMemo } from 'react';
import { KeyboardAvoidingView, RefreshControl, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useComposerInsets } from '../../hooks/useComposerInsets';
import { useInsets } from '../../hooks/useInsets';
import { type Theme, useRoleAccent, useTheme } from '../../theme';

export interface ScreenScaffoldProps {
  children: React.ReactNode;
  /** Scroll the content (default). Turn off for a screen whose body is a list that scrolls itself (FlashList). */
  scroll?: boolean;
  /** A StickyActionBar, laid out below the content so nothing scrolls behind it; it stays above the keyboard. */
  footer?: React.ReactNode;
  /** Adds pull-to-refresh to a scrolling screen. */
  onRefresh?: () => void;
  refreshing?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
}

/** The frame of a screen: `ground` behind everything (never `surface`), the screen margin and the gap between sections,
 * safe areas, and a body that scrolls clear of the keyboard and keeps taps on buttons while a field is focused
 * (`keyboardShouldPersistTaps="handled"`). On a tablet the content is a centred column of at most `contentMax`. */
export function ScreenScaffold({ children, scroll = true, footer, onRefresh, refreshing = false, contentStyle, testID }: ScreenScaffoldProps) {
  const theme = useTheme();
  const accent = useRoleAccent();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useInsets();
  const composer = useComposerInsets();

  // Content clears the gesture area itself when no tab bar and no footer does it for it.
  const bottomClearance = footer ? 0 : composer.bottom;
  const sides = { paddingLeft: Math.max(insets.left, theme.components.screen.margin), paddingRight: Math.max(insets.right, theme.components.screen.margin) };

  return (
    <View style={styles.screen} testID={testID}>
      <KeyboardAvoidingView behavior="padding" style={styles.fill} keyboardVerticalOffset={composer.keyboardOffset}>
        {scroll ? (
          <ScrollView
            testID={testID ? `${testID}-scroll` : undefined}
            style={styles.fill}
            contentContainerStyle={[styles.scrollContent, sides, { paddingBottom: theme.components.screen.sectionGap + bottomClearance }]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            refreshControl={
              onRefresh ? (
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  colors={[accent.mark]}
                  progressBackgroundColor={theme.colors.surface}
                />
              ) : undefined
            }
          >
            <View style={[styles.column, contentStyle]}>{children}</View>
          </ScrollView>
        ) : (
          <View style={[styles.fill, styles.centre, sides, { paddingBottom: bottomClearance }]}>
            <View style={[styles.fillColumn, contentStyle]}>{children}</View>
          </View>
        )}
        {footer}
      </KeyboardAvoidingView>
    </View>
  );
}

function makeStyles({ colors, components, size }: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.ground },
    fill: { flex: 1 },
    centre: { alignItems: 'center' },
    scrollContent: { flexGrow: 1, alignItems: 'center', paddingTop: components.screen.margin },
    // The centred column of a tablet; on a phone it is simply the width of the screen.
    column: { width: '100%', maxWidth: size.contentMax, gap: components.screen.sectionGap },
    fillColumn: { flex: 1, width: '100%', maxWidth: size.contentMax },
  });
}
