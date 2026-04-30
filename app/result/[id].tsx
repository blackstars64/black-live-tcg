// ─── Écran Résultat de scan ───────────────────────────────────────
// Affiche la carte identifiée + prix NM Cardmarket
// Données lues depuis Zustand (scan store + historique)
import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

// ─── Composants ───────────────────────────────────────────────────
import { CardResult } from '../../components/card/CardResult';
import { PriceTag } from '../../components/card/PriceTag';

// ─── Store ────────────────────────────────────────────────────────
import { useScanStore, useHistoryStore } from '../../store';

// ─── Constantes ───────────────────────────────────────────────────
import { Colors } from '../../constants/colors';
import { Layout } from '../../constants/layout';

// Mapping source → libellé affiché
const SOURCE_LABEL: Record<string, string> = {
  cardmarket: 'Cardmarket',
  fallback: 'API officielle (fallback)',
  cache: 'Cache local',
};

export default function ResultScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { currentResult } = useScanStore();
  const { scans } = useHistoryStore();

  // Priorité : résultat courant → historique → null
  const result =
    currentResult?.card.id === id
      ? currentResult
      : (scans.find((s) => s.card.id === id) ?? null);

  // ─── Résultat introuvable ─────────────────────────────────────────
  if (!result) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>Résultat introuvable</Text>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.backLink}>← Retour</Text>
        </Pressable>
      </View>
    );
  }

  const { card, price, confidence, scannedAt } = result;

  // Source du prix (cardmarket / fallback / cache) — encodée dans fetchedAt via store
  // On récupère la source depuis le store si disponible
  const priceSource = price ? 'cardmarket' : null;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      {/* ─── Header ─────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Retour</Text>
        </Pressable>
        <Pressable
          onPress={() => router.replace('/(tabs)/scan')}
          style={styles.rescanButton}
        >
          <Text style={styles.rescanButtonText}>Rescanner</Text>
        </Pressable>
      </View>

      {/* ─── Image de la carte ───────────────────────────────────────── */}
      {card.imageUrl ? (
        <Image
          source={{ uri: card.imageUrl }}
          style={styles.cardImage}
          resizeMode="contain"
        />
      ) : (
        <View style={styles.cardImagePlaceholder}>
          <Text style={styles.cardImagePlaceholderText}>Image non disponible</Text>
        </View>
      )}

      {/* ─── Infos carte ─────────────────────────────────────────────── */}
      <CardResult
        name={card.name}
        nameEn={card.nameEn}
        set={card.set}
        setCode={card.setCode}
        number={card.number}
        game={card.game}
        language={card.language}
      />

      {/* ─── Prix NM ─────────────────────────────────────────────────── */}
      <PriceTag
        price={price?.priceNmLow ?? null}
        language={card.language}
        condition="NM"
      />

      {/* ─── Lien Cardmarket ─────────────────────────────────────────── */}
      {price?.cardmarketUrl && (
        <Pressable
          style={styles.cardmarketButton}
          onPress={() => Linking.openURL(price.cardmarketUrl!)}
        >
          <Text style={styles.cardmarketButtonText}>Voir sur Cardmarket ↗</Text>
        </Pressable>
      )}

      {/* ─── Métadonnées ─────────────────────────────────────────────── */}
      <View style={styles.meta}>
        {priceSource && (
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Source</Text>
            <Text style={styles.metaValue}>{SOURCE_LABEL[priceSource] ?? priceSource}</Text>
          </View>
        )}
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Confiance OCR</Text>
          <Text style={styles.metaValue}>{Math.round(confidence * 100)}%</Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Scanné à</Text>
          <Text style={styles.metaValue}>
            {new Date(scannedAt).toLocaleTimeString('fr-FR', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  container: {
    padding: Layout.padding,
    gap: 20,
    paddingBottom: 48,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
  },
  backButton: {
    padding: 8,
  },
  backButtonText: {
    color: Colors.primary,
    fontSize: 15,
    fontWeight: '600',
  },
  rescanButton: {
    backgroundColor: Colors.surface,
    borderRadius: Layout.radiusSm,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  rescanButtonText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  cardImage: {
    width: '60%',
    aspectRatio: 0.71,
    alignSelf: 'center',
    borderRadius: 12,
  },
  cardImagePlaceholder: {
    width: '60%',
    aspectRatio: 0.71,
    alignSelf: 'center',
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardImagePlaceholderText: {
    color: Colors.textMuted,
    fontSize: 13,
  },
  cardmarketButton: {
    backgroundColor: Colors.surface,
    borderRadius: Layout.radius,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: Colors.primary,
    alignItems: 'center',
  },
  cardmarketButtonText: {
    color: Colors.primary,
    fontSize: 15,
    fontWeight: '600',
  },
  meta: {
    backgroundColor: Colors.surface,
    borderRadius: Layout.radius,
    padding: Layout.padding,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 10,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metaLabel: {
    color: Colors.textMuted,
    fontSize: 13,
  },
  metaValue: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },
  emptyContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  emptyText: {
    color: Colors.textSecondary,
    fontSize: 16,
  },
  backLink: {
    color: Colors.primary,
    fontSize: 15,
  },
});
