import React, { useMemo } from 'react';
import type { PickedPhoto } from '../../../utils/photoPicker';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { ScreenState, useToast } from '../../components';
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
  const { conversationId, otherUserName } = route.params;
  const userId = useAuthStore(state => state.user?.id);
  const toast = useToast();
  const conversation = useConversationMessages(conversationId, userId);
  const messages = useMemo(() => conversation.data ?? [], [conversation.data]);
  const send = useSendMessage(conversationId, userId);
  const attachmentPaths = useMemo(() => messages.flatMap(m => m.attachments), [messages]);
  const { data: attachmentUrls = {} } = useAttachmentUrls(attachmentPaths);
  const composer = useComposerInsets();

  const onSend = async (body: string, images: PickedPhoto[]) => {
    if (!userId) return;
    try {
      await send.mutateAsync({ body, images });
    } catch (error) {
      // Nothing to decide: the message simply did not go, so a short toast says so and why.
      toast.error(`Message not sent. ${errorMessage(error)}`);
    }
  };

  return (
    <View style={styles.flex}>
      <ScreenState query={conversation} errorTitle="Couldn't load messages">
        {() => (
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
                  <MessageBubble
                    message={item}
                    isOwn={item.sender_id === userId}
                    attachmentUrls={attachmentUrls}
                    senderName={otherUserName}
                  />
                )}
              />
              <ChatInput onSend={onSend} sending={send.isPending} />
            </View>
          </KeyboardAvoidingView>
        )}
      </ScreenState>
    </View>
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
