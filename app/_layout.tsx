import { Stack } from 'expo-router';

import { Colors } from '../constants/colors';

export default function RootLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.background },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="result/[id]"
        options={{
          headerShown: true,
          headerTitle: 'Détail carte',
          headerStyle: { backgroundColor: Colors.surface },
          headerTintColor: Colors.text,
          headerBackTitle: 'Retour',
        }}
      />
    </Stack>
  );
}
