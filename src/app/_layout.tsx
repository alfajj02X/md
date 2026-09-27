import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { queryClient } from '@/lib/queryClient';
import { registerForPushNotifications, subscribeToNotifications } from '@/lib/notifications';
import { useAuth } from '@/stores/auth';

SplashScreen.preventAutoHideAsync();

function BootGate({ children }: { children: React.ReactNode }) {
  const initialized = useAuth((s) => s.initialized);
  const init = useAuth((s) => s.init);
  const session = useAuth((s) => s.session);

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    if (initialized) void SplashScreen.hideAsync();
  }, [initialized]);

  // Push: register token on sign-in, wire tap handling once.
  useEffect(() => {
    const unsubscribe = subscribeToNotifications();
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (session?.user) {
      void registerForPushNotifications(session.user.id);
    }
  }, [session?.user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!initialized) return null;
  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <BootGate>
            <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="auth" />
              <Stack.Screen name="(customer)" />
              <Stack.Screen name="(provider)" />
            </Stack>
          </BootGate>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
