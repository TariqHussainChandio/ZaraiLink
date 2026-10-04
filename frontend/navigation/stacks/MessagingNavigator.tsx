import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { MESSAGING_ROUTES } from '../../common/constants/routes';
import { ChatScreen } from '../../common/messaging/screens/ChatScreen';
import { ConversationListScreen } from '../../common/messaging/screens/ConversationListScreen';
import { stackScreenOptions } from '../stackHeader';

export type MessagingStackParamList = {
  [MESSAGING_ROUTES.ConversationList]: undefined;
  [MESSAGING_ROUTES.Chat]: { conversationId: string; otherUserName: string };
};

export type MessagingScreenProps<RouteName extends keyof MessagingStackParamList> =
  NativeStackScreenProps<MessagingStackParamList, RouteName>;

const Stack = createNativeStackNavigator<MessagingStackParamList>();

export function MessagingNavigator() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen
        name={MESSAGING_ROUTES.ConversationList}
        component={ConversationListScreen}
        options={{ title: 'Messages' }}
      />
      <Stack.Screen
        name={MESSAGING_ROUTES.Chat}
        component={ChatScreen}
        options={({ route }) => ({ title: route.params.otherUserName || 'Conversation' })}
      />
    </Stack.Navigator>
  );
}
