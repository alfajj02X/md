import { Stack } from 'expo-router';

export default function BookLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="address" />
      <Stack.Screen name="slot" />
      <Stack.Screen name="summary" />
    </Stack>
  );
}
