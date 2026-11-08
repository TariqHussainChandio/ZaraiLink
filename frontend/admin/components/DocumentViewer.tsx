import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Banner, Button, PhotoViewer, Sheet, Spinner } from '../../common/components';
import { useTheme, type Theme } from '../../theme';
import { useApplicationDocumentLinks } from '../hooks/admin';

interface ViewerDocument {
  id: string;
  /** The requirement it answers, not the file name: "CNIC front" (AD-06). */
  label: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  role: 'dealer' | 'expert';
  applicantId: string;
  /** The photographed documents, in the order they are listed. */
  documents: ViewerDocument[];
  /** The one that was tapped. */
  startId?: string;
}

/**
 * The application's photographed documents, full screen, from their ten-minute signed links (SRDS §12): pinch or
 * double-tap to zoom (a CNIC number is unreadable otherwise), next and previous through the set, and each photo named by
 * the requirement it answers. The links are asked for when the viewer opens and never kept, so one that has expired is
 * replaced by opening again; if they cannot be had, "Get a new link" asks again instead of leaving a dead end.
 */
export function DocumentViewer({ visible, onClose, role, applicantId, documents, startId }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const links = useApplicationDocumentLinks(role, applicantId, documents, visible);

  // While a fresh set is on its way, the previous one (from an earlier opening) is not shown: its links may have expired.
  if (links.data && !links.isFetching) {
    const start = Math.max(0, links.data.findIndex(link => link.id === startId));
    return <PhotoViewer visible={visible} onClose={onClose} photos={links.data.map(link => ({ uri: link.uri, label: link.label }))} initialIndex={start} />;
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="Opening documents">
      <View style={styles.body}>
        {links.isError && !links.isFetching ? (
          <>
            <Banner tone="danger" title="Couldn't open the documents">
              The link may have expired, or the connection dropped.
            </Banner>
            <Button label="Get a new link" onPress={() => links.refetch()} />
          </>
        ) : (
          <Spinner />
        )}
      </View>
    </Sheet>
  );
}

function makeStyles({ space }: Theme) {
  return StyleSheet.create({
    body: { gap: space[4], alignItems: 'stretch' },
  });
}
