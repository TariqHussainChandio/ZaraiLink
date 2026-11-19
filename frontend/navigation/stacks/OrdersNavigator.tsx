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
import { stackScreenOptions } from '../stackHeader';

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

export function OrdersNavigator() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
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
