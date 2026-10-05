import React, { useMemo, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { EmptyState, Spinner } from '../../common/components';
import type { ADMIN_HOME_ROUTES } from '../../common/constants/routes';
import type { AdminScreenProps } from '../../navigation/stacks/AdminNavigator';
import { useTheme, type Theme } from '../../theme';

/**
 * A photographed application document, full screen, from its ten-minute signed link (A3b; SRDS §12: the admin inspects
 * the documents before deciding). PDFs open in the phone's own viewer instead (ApplicationDetailScreen).
 */
export function DocumentViewerScreen({ route }: AdminScreenProps<typeof ADMIN_HOME_ROUTES.DocumentViewer>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [state, setState] = useState<'loading' | 'shown' | 'failed'>('loading');
  return (
    <View style={styles.screen}>
      {state === 'failed' ? (
        <EmptyState title="Could not open this document" description="The link may have expired. Go back and open it again." />
      ) : (
        <Image
          source={{ uri: route.params.url }}
          style={styles.image}
          resizeMode="contain"
          accessibilityLabel={route.params.title}
          onLoad={() => setState('shown')}
          onError={() => setState('failed')}
        />
      )}
      {state === 'loading' ? (
        <View style={styles.overlay}>
          <Spinner />
        </View>
      ) : null}
    </View>
  );
}

function makeStyles({ colors }: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.ground },
    image: { flex: 1 },
    overlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  });
}
