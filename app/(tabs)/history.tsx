import { FlatList, StyleSheet, Text, View } from 'react-native';

import { Colors } from '../../constants/colors';
import { Layout } from '../../constants/layout';

// TODO: brancher sur useCardStore (Session B) pour les données réelles
export default function HistoryScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Historique</Text>
      <FlatList
        data={[]}
        keyExtractor={(item) => item}
        renderItem={null}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>📭</Text>
            <Text style={styles.emptyText}>Aucun scan récent</Text>
            <Text style={styles.emptyHint}>
              Scannez une carte pour la retrouver ici
            </Text>
          </View>
        }
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  title: {
    color: Colors.text,
    fontSize: 22,
    fontWeight: '700',
    padding: Layout.padding,
    paddingTop: Layout.paddingLg,
  },
  list: {
    flexGrow: 1,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    gap: 8,
  },
  emptyIcon: {
    fontSize: 48,
  },
  emptyText: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  emptyHint: {
    color: Colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: Layout.paddingLg,
  },
});
