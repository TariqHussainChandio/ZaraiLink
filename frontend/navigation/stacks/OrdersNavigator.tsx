import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { ORDERS_ROUTES } from '../../constants/routes';
import { OrderDetailScreen } from '../../screens/orders/OrderDetailScreen';
import { OrderHistoryScreen } from '../../screens/orders/OrderHistoryScreen';
import { PaymentMethodScreen } from '../../screens/payments/PaymentMethodScreen';
import { PaymentProcessingScreen } from '../../screens/payments/PaymentProcessingScreen';
import { PaymentResultScreen } from '../../screens/payments/PaymentResultScreen';
import { WriteReviewScreen } from '../../screens/reviews/WriteReviewScreen';

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
    <Stack.Navigator screenOptions={{ headerShown: true }}>
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
        options={{ title: 'Payment Method' }}
      />
      <Stack.Screen
        name={ORDERS_ROUTES.PaymentProcessing}
        component={PaymentProcessingScreen}
        options={{ title: 'Payment', headerBackVisible: false }}
      />
      <Stack.Screen
        name={ORDERS_ROUTES.PaymentResult}
        component={PaymentResultScreen}
        options={{ title: 'Payment Result', headerBackVisible: false }}
      />
      <Stack.Screen
        name={ORDERS_ROUTES.WriteReview}
        component={WriteReviewScreen}
        options={{ title: 'Write a Review' }}
      />
    </Stack.Navigator>
  );
}
