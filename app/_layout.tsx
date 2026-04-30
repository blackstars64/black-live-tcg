import { useEffect } from 'react';
import { Stack } from 'expo-router';

import { Colors } from '../constants/colors';
import { initPriceCache } from '../lib/price';

export default function RootLayout() {
  useEffect(() => {
    initPriceCache().catch(() => {});
  }, []);

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
