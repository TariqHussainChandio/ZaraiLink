import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import type { Asset } from 'react-native-image-picker';
import { FlatList, KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { Spinner } from '../../components/ui';
import { ChatInput } from '../../components/features/messaging/ChatInput';
import { MessageBubble } from '../../components/features/messaging/MessageBubble';
import { useRealtimeMessages } from '../../hooks/realtime/useRealtimeMessages';
import {
  fetchMessages,
  markConversationRead,
  resolveAttachmentUrls,
  sendMessage,
  uploadMessageAttachments,
} from '../../services/modules/messaging/messagingService';
import { useAuthStore } from '../../store/authStore';
import { lightTheme } from '../../theme';
import type { Message } from '../../types/messaging';
import type { MessagingScreenProps } from '../../navigation/stacks/MessagingNavigator';

export function ChatScreen({ route }: MessagingScreenProps<'Chat'>) {
  const { conversationId } = route.params;
  const userId = useAuthStore(state => state.user?.id);
  const [messages, setMessages] = useState<Message[]>([]);
  const [attachmentUrls, setAttachmentUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  // Re-resolving an already-signed path is harmless (just an extra cheap call) — doing that
  // beats tracking "already resolved" in a dep array, which would either go stale (reading
  // `attachmentUrls` from a stale closure) or re-create this callback, and therefore the
  // `useFocusEffect`/`useRealtimeMessages` effects that call it, on every resolve.
  const resolveNewAttachments = useCallback(async (list: Message[]) => {
    const paths = list.flatMap(m => m.attachments);
    if (paths.length === 0) return;
    const resolved = await resolveAttachmentUrls(paths);
    setAttachmentUrls(current => ({ ...current, ...resolved }));
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      fetchMessages(conversationId).then(data => {
        if (cancelled) return;
        setMessages(data);
        setLoading(false);
        resolveNewAttachments(data);
      }).catch(err => {
        console.warn('[ChatScreen] failed to load messages:', err);
        if (!cancelled) setLoading(false);
      });
      if (userId) markConversationRead(conversationId);
      return () => {
        cancelled = true;
      };
    }, [conversationId, userId, resolveNewAttachments]),
  );

  useRealtimeMessages(conversationId, incoming => {
    setMessages(prev => (prev.some(m => m.id === incoming.id) ? prev : [...prev, incoming]));
    resolveNewAttachments([incoming]);
  });

  const onSend = async (body: string, images: Asset[]) => {
    if (!userId) return;
    setSending(true);
    try {
      const attachments = images.length > 0 ? await uploadMessageAttachments(conversationId, userId, images) : [];
      const message = await sendMessage(conversationId, body, attachments);
      setMessages(prev => (prev.some(m => m.id === message.id) ? prev : [...prev, message]));
      resolveNewAttachments([message]);
    } finally {
      setSending(false);
    }
  };

  if (loading) return <Spinner fullscreen />;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <View style={styles.flex}>
        <FlatList
          data={[...messages].reverse()}
          inverted
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <MessageBubble message={item} isOwn={item.sender_id === userId} attachmentUrls={attachmentUrls} />
          )}
        />
        <ChatInput onSend={onSend} sending={sending} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: lightTheme.colors.neutral.white,
  },
  list: {
    paddingVertical: lightTheme.spacing.md,
  },
});
