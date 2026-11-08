import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { PhotoViewer, QueryState, ScreenScaffold } from '../../components';
import { ChatInput } from '../components/ChatInput';
import { DaySeparator } from '../components/DaySeparator';
import { MessageBubble } from '../components/MessageBubble';
import { useAttachmentUrls, useConversationMessages } from '../hooks/messaging';
import { useChatOutbox } from '../hooks/outbox';
import { buildChatRows, type ChatRow } from '../hooks/chatRows';
import { useComposerInsets } from '../../../hooks/useComposerInsets';
import { useAuthStore } from '../../../state/authStore';
import { useTheme, type Theme } from '../../../theme';
import type { MessagingScreenProps } from '../../../navigation/stacks/MessagingNavigator';

interface OpenPhotos {
  photos: { uri: string; label: string }[];
  index: number;
}

export function ChatScreen({ route }: MessagingScreenProps<'Chat'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { conversationId, otherUserName } = route.params;
  const userId = useAuthStore(state => state.user?.id);
  const messagesQuery = useConversationMessages(conversationId, userId);
  const messages = useMemo(() => messagesQuery.data ?? [], [messagesQuery.data]);
  const { outgoing, send, retry } = useChatOutbox(conversationId, userId);
  const rows = useMemo(() => buildChatRows(messages, outgoing, userId), [messages, outgoing, userId]);
  const attachmentPaths = useMemo(() => messages.flatMap(m => m.attachments), [messages]);
  const { data: signedUrls = {} } = useAttachmentUrls(attachmentPaths);
  // A photo still waiting to be sent is drawn from the file on the phone.
  const attachmentUrls = useMemo(() => {
    const local: Record<string, string> = {};
    for (const item of outgoing) for (const image of item.images) if (image.uri) local[image.uri] = image.uri;
    return { ...signedUrls, ...local };
  }, [signedUrls, outgoing]);
  const composer = useComposerInsets();
  const [viewer, setViewer] = useState<OpenPhotos | null>(null);

  const speaker = otherUserName || 'the other person';
  const openPhotos = (paths: string[], index: number, own: boolean) => {
    const photos = paths.flatMap((path, i) => {
      const uri = attachmentUrls[path];
      return uri ? [{ uri, label: `Photo ${i + 1} of ${paths.length} from ${own ? 'you' : speaker}` }] : [];
    });
    if (photos.length > 0) setViewer({ photos, index: Math.min(index, photos.length - 1) });
  };

  const renderItem = ({ item }: { item: ChatRow }) => {
    if (item.kind === 'day') return <DaySeparator label={item.label} />;
    const isOwn = item.message.sender_id === userId;
    return (
      <MessageBubble
        message={item.message}
        isOwn={isOwn}
        senderName={otherUserName}
        attachmentUrls={attachmentUrls}
        delivery={item.delivery}
        onRetry={item.localId ? () => retry(item.localId as string) : undefined}
        onOpenPhotos={index => openPhotos(item.message.attachments, index, isOwn)}
      />
    );
  };

  return (
    <ScreenScaffold
      scroll={false}
      footer={
        // The footer clears the gesture area itself; inside a tab the tab bar already does.
        <View style={[styles.footer, { paddingBottom: composer.bottom }]}>
          <ChatInput onSend={send} />
        </View>
      }
    >
      <QueryState
        query={messagesQuery}
        isEmpty={rows.length === 0}
        empty={{ title: 'No messages yet', description: `Write the first message to ${speaker}.` }}
        failureTitle="Couldn't load messages"
      >
        <View style={styles.fill}>
        <FlashList
          data={rows}
          // FlashList v2 has no `inverted`: the newest message is at the bottom and the list starts and follows there.
          maintainVisibleContentPosition={{ startRenderingFromBottom: true, autoscrollToBottomThreshold: 0.2 }}
          keyExtractor={item => item.key}
          getItemType={item => item.kind}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.list}
          renderItem={renderItem}
        />
        </View>
      </QueryState>
      <PhotoViewer visible={viewer !== null} onClose={() => setViewer(null)} photos={viewer?.photos ?? []} initialIndex={viewer?.index ?? 0} />
    </ScreenScaffold>
  );
}

function makeStyles({ colors, space }: Theme) {
  return StyleSheet.create({
    fill: { flex: 1 },
    footer: { backgroundColor: colors.surface },
    list: { paddingVertical: space[3] },
  });
}
