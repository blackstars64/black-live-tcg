// ─── Écran historique des scans ───────────────────────────────────
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Colors } from '../../constants/colors';
import { Layout } from '../../constants/layout';
import { ScanHistoryItem } from '../../components/card/ScanHistoryItem';
import { useScanStore, useHistoryStore } from '../../store';
import type { ScanResult } from '../../types';

export default function HistoryScreen() {
  const router = useRouter();
  const { scans, clearHistory } = useHistoryStore();
  const { setResult } = useScanStore();

  function handlePress(scan: ScanResult): void {
    // Charger le résultat dans le store pour que /result/[id] puisse le lire
    setResult(scan);
    router.push(`/result/${scan.card.id}`);
  }

  function handleClear(): void {
    Alert.alert(
      'Vider l\'historique',
      'Supprimer tous les scans ?',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Vider', style: 'destructive', onPress: clearHistory },
      ]
    );
  }

  return (
    <View style={styles.container}>
      {/* En-tête */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Historique</Text>
          {scans.length > 0 && (
            <Text style={styles.subtitle}>{scans.length} scan{scans.length > 1 ? 's' : ''}</Text>
          )}
        </View>
        {scans.length > 0 && (
          <Pressable style={styles.clearButton} onPress={handleClear}>
            <Text style={styles.clearButtonText}>Vider</Text>
          </Pressable>
        )}
      </View>

      {/* Liste */}
      <FlatList
        data={scans}
        keyExtractor={(scan) => `${scan.card.id}-${scan.scannedAt}`}
        renderItem={({ item }) => (
          <ScanHistoryItem scan={item} onPress={() => handlePress(item)} />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>📭</Text>
            <Text style={styles.emptyText}>Aucun scan récent</Text>
            <Text style={styles.emptyHint}>
              Scannez une carte pour la retrouver ici
            </Text>
          </View>
        }
        contentContainerStyle={scans.length === 0 ? styles.listEmpty : styles.list}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: Layout.padding,
    paddingTop: Layout.paddingLg + 16,
    paddingBottom: Layout.padding,
  },
  title: {
    color: Colors.text,
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  subtitle: {
    color: Colors.textMuted,
    fontSize: 13,
    marginTop: 2,
  },
  clearButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Layout.radiusSm,
    borderWidth: 1,
    borderColor: Colors.error,
  },
  clearButtonText: {
    color: Colors.error,
    fontSize: 13,
    fontWeight: '600',
  },
  list: {
    paddingTop: 4,
    paddingBottom: 32,
  },
  listEmpty: {
    flexGrow: 1,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    gap: 10,
  },
  emptyIcon: {
    fontSize: 52,
  },
  emptyText: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: '600',
  },
  emptyHint: {
    color: Colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: Layout.paddingLg,
    lineHeight: 20,
  },
});
