import React, { useMemo } from 'react';
import type { PickedPhoto } from '../../../utils/photoPicker';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { EmptyState, Spinner } from '../../components';
import { ChatInput } from '../components/ChatInput';
import { MessageBubble } from '../components/MessageBubble';
import { useAttachmentUrls, useConversationMessages, useSendMessage } from '../hooks/messaging';
import { useComposerInsets } from '../../../hooks/useComposerInsets';
import { useAuthStore } from '../../../state/authStore';
import { useTheme, type Theme } from '../../../theme';
import { errorMessage } from '../../../utils/errorMessage';
import type { MessagingScreenProps } from '../../../navigation/stacks/MessagingNavigator';

export function ChatScreen({ route }: MessagingScreenProps<'Chat'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { conversationId } = route.params;
  const userId = useAuthStore(state => state.user?.id);
  const { data: messages = [], isPending, error, refetch } = useConversationMessages(conversationId, userId);
  const send = useSendMessage(conversationId, userId);
  const attachmentPaths = useMemo(() => messages.flatMap(m => m.attachments), [messages]);
  const { data: attachmentUrls = {} } = useAttachmentUrls(attachmentPaths);
  const composer = useComposerInsets();

  const onSend = async (body: string, images: PickedPhoto[]) => {
    if (!userId) return;
    await send.mutateAsync({ body, images });
  };

  if (isPending) return <Spinner fullscreen />;
  if (error && messages.length === 0) {
    return (
      <EmptyState
        title="Couldn't load messages"
        description={errorMessage(error)}
        actionLabel="Retry"
        onAction={() => refetch()}
      />
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={composer.keyboardOffset}
    >
      <View style={[styles.flex, { paddingBottom: composer.bottom }]}>
        <FlashList
          data={messages}
          // FlashList v2 has no `inverted`: the newest message is at the bottom and the list starts and follows there.
          maintainVisibleContentPosition={{ startRenderingFromBottom: true, autoscrollToBottomThreshold: 0.2 }}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <MessageBubble message={item} isOwn={item.sender_id === userId} attachmentUrls={attachmentUrls} />
          )}
        />
        <ChatInput onSend={onSend} sending={send.isPending} />
      </View>
    </KeyboardAvoidingView>
  );
}

function makeStyles({ colors, space }: Theme) {
  return StyleSheet.create({
    flex: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    list: {
      paddingVertical: space[3],
    },
  });
}
