import { NavigationContainer } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { initLanguage } from './src/localization';
import { linking } from './src/navigation/linking';
import { RootNavigator } from './src/navigation/stacks/RootNavigator';
import { useAuthStore } from './src/store/authStore';

const queryClient = new QueryClient();

function App() {
  useEffect(() => {
    const unsubscribe = useAuthStore.getState().initialize();
    initLanguage();
    return unsubscribe;
  }, []);

  return (
    <GestureHandlerRootView style={styles.flex}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <NavigationContainer linking={linking}>
            <RootNavigator />
          </NavigationContainer>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});

export default App;
