// The Orders tab stack: order list, order detail, payment and review screens.
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { ORDERS_ROUTES } from '../../common/constants/routes';
import { OrderDetailScreen } from '../../common/orders/screens/OrderDetailScreen';
import { OrderHistoryScreen } from '../../common/orders/screens/OrderHistoryScreen';
import { PaymentMethodScreen } from '../../common/payments/screens/PaymentMethodScreen';
import { PaymentProcessingScreen } from '../../common/payments/screens/PaymentProcessingScreen';
import { PaymentResultScreen } from '../../common/payments/screens/PaymentResultScreen';
import { WriteReviewScreen } from '../../common/reviews/screens/WriteReviewScreen';
import { homeActions } from '../headerActions';
import { stackOptionsWithActions } from '../stackHeader';

export type OrdersStackParamList = {
  [ORDERS_ROUTES.OrderHistory]: undefined;
  [ORDERS_ROUTES.OrderDetail]: { orderId: string };
  [ORDERS_ROUTES.PaymentMethod]: { orderId: string };
  [ORDERS_ROUTES.PaymentProcessing]: { paymentId: string };
  [ORDERS_ROUTES.PaymentResult]: { paymentId: string };
  [ORDERS_ROUTES.WriteReview]: { orderId: string; listingId: string | null; sellerId: string };
};

export type OrdersScreenProps<RouteName extends keyof OrdersStackParamList> =
  NativeStackScreenProps<OrdersStackParamList, RouteName>;

const Stack = createNativeStackNavigator<OrdersStackParamList>();
// D20: the order list's app bar has Messages and the bell top right, as on the buyer's other tabs; the person's photo is
// on their home screen only.
const ORDERS_STACK_OPTIONS = stackOptionsWithActions({ [ORDERS_ROUTES.OrderHistory]: homeActions });

// Renders the Orders tab's screens with their app-bar actions.
export function OrdersNavigator() {
  return (
    <Stack.Navigator screenOptions={ORDERS_STACK_OPTIONS}>
      <Stack.Screen
        name={ORDERS_ROUTES.OrderHistory}
        component={OrderHistoryScreen}
        options={{ title: 'Orders' }}
      />
      <Stack.Screen
        name={ORDERS_ROUTES.OrderDetail}
        component={OrderDetailScreen}
        options={{ title: 'Order' }}
      />
      <Stack.Screen
        name={ORDERS_ROUTES.PaymentMethod}
        component={PaymentMethodScreen}
        options={{ title: 'Payment method' }}
      />
      <Stack.Screen
        name={ORDERS_ROUTES.PaymentProcessing}
        component={PaymentProcessingScreen}
        options={{ title: 'Payment', headerBackVisible: false }}
      />
      <Stack.Screen
        name={ORDERS_ROUTES.PaymentResult}
        component={PaymentResultScreen}
        options={{ title: 'Payment result', headerBackVisible: false }}
      />
      <Stack.Screen
        name={ORDERS_ROUTES.WriteReview}
        component={WriteReviewScreen}
        options={{ title: 'Write a review' }}
      />
    </Stack.Navigator>
  );
}
