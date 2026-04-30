import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { Colors } from '../../constants/colors';
import { Layout } from '../../constants/layout';

// TODO: charger les données réelles depuis le cache SQLite via lib/db/cache.ts (Session B)
export default function ResultScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  // TODO P2 : remplacer par le fetch réel (cache → API)
  const isLoading = true;

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <LoadingSpinner />
        <Text style={styles.loadingText}>Chargement de la carte...</Text>
        <Text style={styles.idHint}>ID : {id}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* TODO P2 : CardResult + PriceTag */}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    padding: Layout.padding,
  },
  centered: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: Colors.textSecondary,
    fontSize: 15,
  },
  idHint: {
    color: Colors.textMuted,
    fontSize: 12,
  },
});
