import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import { fetchMessages, uploadMessageAttachments } from '../services/messagingService';
import type { Message, OutgoingMessage } from '../types/messaging';
import type { PickedPhoto } from '../../../utils/photoPicker';
import { queryKeys } from '../../../hooks/keys';
import { isDelivered } from './chatRows';
import { useSendMessage } from './messaging';

/**
 * The messages being sent (FA-03). `send` returns at once and the message is drawn as "Sending…"; the photos are
 * uploaded, then the message is posted. If anything fails it stays on screen as "Not sent" with its text and photos, and
 * `retry` carries on from where it stopped: photos already uploaded are not uploaded again, and before posting a second time
 * the conversation is read, so a message whose reply was lost is recognised and not duplicated (the API has no
 * idempotency key for messages yet, so this is done on the phone).
 */
export function useChatOutbox(conversationId: string, userId: string | undefined) {
  const queryClient = useQueryClient();
  const key = queryKeys.messaging.messages(conversationId);
  const { mutateAsync: post } = useSendMessage(conversationId, userId);
  const [outgoing, setOutgoing] = useState<OutgoingMessage[]>([]);
  const counter = useRef(0);

  const patch = useCallback((localId: string, changes: Partial<OutgoingMessage>) => {
    setOutgoing(list => list.map(item => (item.localId === localId ? { ...item, ...changes } : item)));
  }, []);

  const deliver = useCallback(
    async (item: OutgoingMessage) => {
      if (!userId) return;
      patch(item.localId, { status: 'sending' });
      try {
        let uploaded = item.uploaded;
        if (!uploaded) {
          uploaded = item.images.length > 0 ? await uploadMessageAttachments(conversationId, userId, item.images) : [];
          patch(item.localId, { uploaded });
        }
        let alreadySent = false;
        if (item.baseline) {
          // A second try: first see whether the first one got through.
          const fresh = await fetchMessages(conversationId);
          queryClient.setQueryData<Message[]>(key, fresh);
          alreadySent = isDelivered({ ...item, uploaded }, fresh, userId);
        } else {
          patch(item.localId, { baseline: (queryClient.getQueryData<Message[]>(key) ?? []).map(message => message.id) });
        }

        if (alreadySent) queryClient.invalidateQueries({ queryKey: queryKeys.messaging.conversations() });
        else await post({ body: item.body, images: [], attachments: uploaded });
        setOutgoing(list => list.filter(entry => entry.localId !== item.localId));
      } catch {
        patch(item.localId, { status: 'failed' });
      }
    },
    [conversationId, key, patch, post, queryClient, userId],
  );

  const send = useCallback(
    (body: string, images: PickedPhoto[]) => {
      counter.current += 1;
      const item: OutgoingMessage = {
        localId: `pending-${counter.current}`,
        body,
        images,
        createdAt: new Date().toISOString(),
        status: 'sending',
        uploaded: null,
        baseline: null,
      };
      setOutgoing(list => [...list, item]);
      // Not returned: the composer is free again at once; the bubble carries the outcome.
      deliver(item);
    },
    [deliver],
  );

  const retry = useCallback(
    (localId: string) => {
      const item = outgoing.find(entry => entry.localId === localId);
      if (item && item.status === 'failed') deliver(item);
    },
    [deliver, outgoing],
  );

  return { outgoing, send, retry };
}
