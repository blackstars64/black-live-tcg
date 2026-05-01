// ─── Écran Résultat de scan ───────────────────────────────────────
// Affiche la carte identifiée + prix NM Cardmarket
// Données lues depuis Zustand (scan store + historique)
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

// ─── Composants ───────────────────────────────────────────────────
import { CardResult } from '../../components/card/CardResult';
import { PriceTag } from '../../components/card/PriceTag';

// ─── Store ────────────────────────────────────────────────────────
import { useScanStore, useHistoryStore } from '../../store';

// ─── API impressions (sélecteur d'édition 6c) ────────────────────
import { getMtgPrintings } from '../../lib/api/scryfall';
import { getYgoPrintings } from '../../lib/api/ygoprodeck';
import { getPokemonPrintings } from '../../lib/api/pokemon-tcg';
import { getCardPrice } from '../../lib/price';

// ─── Types ────────────────────────────────────────────────────────
import type { Card, CardPrice } from '../../types/card';

// ─── Constantes ───────────────────────────────────────────────────
import { Colors } from '../../constants/colors';
import { Layout } from '../../constants/layout';

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

  // ─── État local ───────────────────────────────────────────────────
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [currentPrice, setCurrentPrice] = useState<CardPrice | null>(null);
  const [printings, setPrintings] = useState<Card[]>([]);
  const [showEditions, setShowEditions] = useState(false);
  const [loadingPrintings, setLoadingPrintings] = useState(false);
  const [loadingPrice, setLoadingPrice] = useState(false);

  // ─── Init depuis le résultat store ───────────────────────────────
  useEffect(() => {
    if (!result) return;
    setSelectedCard(result.card);
    setCurrentPrice(result.price);
    loadPrintings(result.card);
    // Debug MTG : log les données de la carte pour diagnostiquer les images manquantes
    if (result.card.game === 'mtg') {
      console.log('[result] MTG card:', JSON.stringify({
        name: result.card.name,
        nameEn: result.card.nameEn,
        set: result.card.set,
        setCode: result.card.setCode,
        number: result.card.number,
        imageUrl: result.card.imageUrl,
        oracleId: result.card.oracleId,
      }));
    }
  }, [result?.card.id]);

  async function loadPrintings(card: Card): Promise<void> {
    setLoadingPrintings(true);
    try {
      let fetched: Card[] = [];
      if (card.game === 'mtg' && card.oracleId) {
        fetched = await getMtgPrintings(card.oracleId);
      } else if (card.game === 'yugioh') {
        // L'id YGO est le numéro de la carte (ex: "12345") — on strip le suffix "-SET"
        const baseId = card.id.split('-')[0];
        fetched = await getYgoPrintings(baseId);
      } else if (card.game === 'pokemon' && card.nameEn) {
        fetched = await getPokemonPrintings(card.nameEn);
      }
      setPrintings(fetched);
    } finally {
      setLoadingPrintings(false);
    }
  }

  // ─── Changement d'édition (6c + 6b) ──────────────────────────────
  async function handleEditionChange(printing: Card): Promise<void> {
    if (!result) return;
    setSelectedCard(printing);
    setShowEditions(false);
    setLoadingPrice(true);
    try {
      const priceResult = await getCardPrice(
        printing.id,
        printing.nameEn,
        printing.game,
        result.card.language, // langue du scan d'origine
        printing.set,
        printing.number
      );
      setCurrentPrice(
        priceResult
          ? {
              cardId: printing.id,
              language: priceResult.language,
              condition: priceResult.condition,
              priceNmLow: priceResult.priceNmLow,
              currency: priceResult.currency,
              fetchedAt: priceResult.fetchedAt,
              cardmarketUrl: priceResult.productUrl,
            }
          : null
      );
    } finally {
      setLoadingPrice(false);
    }
  }

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

  const card = selectedCard ?? result.card;
  const price = currentPrice ?? result.price;
  const { confidence, scannedAt } = result;
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

      {/* ─── Sélecteur d'édition (6c) ────────────────────────────────── */}
      {loadingPrintings ? (
        <View style={styles.editionLoading}>
          <ActivityIndicator size="small" color={Colors.primary} />
          <Text style={styles.editionLoadingText}>Chargement des éditions…</Text>
        </View>
      ) : printings.length > 1 ? (
        <View style={styles.editionSection}>
          <Pressable
            style={styles.editionToggleRow}
            onPress={() => setShowEditions((v) => !v)}
          >
            <Text style={styles.editionToggleLabel}>
              {card.set || 'Édition'}{card.setCode ? ` (${card.setCode})` : ''}
            </Text>
            <Text style={styles.editionToggleChevron}>
              {showEditions ? '▲' : `▾ ${printings.length} éditions`}
            </Text>
          </Pressable>

          {showEditions && (
            <View style={styles.editionList}>
              {printings.map((printing) => {
                const isActive = card.setCode === printing.setCode && card.number === printing.number;
                return (
                  <Pressable
                    key={`${printing.id}-${printing.setCode}-${printing.number}`}
                    style={[styles.editionItem, isActive && styles.editionItemActive]}
                    onPress={() => handleEditionChange(printing)}
                  >
                    <View style={styles.editionItemLeft}>
                      <Text style={[styles.editionItemText, isActive && styles.editionItemTextActive]}>
                        {printing.set}
                      </Text>
                      {printing.rarity ? (
                        <Text style={[styles.editionItemRarity, isActive && styles.editionItemRarityActive]}>
                          {printing.rarity}
                        </Text>
                      ) : null}
                    </View>
                    <Text style={[styles.editionItemCode, isActive && styles.editionItemCodeActive]}>
                      {[printing.setCode, printing.number].filter(Boolean).join(' · ')}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      ) : null}

      {/* ─── Prix NM ─────────────────────────────────────────────────── */}
      {loadingPrice ? (
        <View style={styles.priceLoading}>
          <ActivityIndicator size="small" color={Colors.primary} />
          <Text style={styles.priceLoadingText}>Récupération du prix…</Text>
        </View>
      ) : (
        <PriceTag
          price={price?.priceNmLow ?? null}
          language={card.language}
          condition="NM"
        />
      )}

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

  // ─── Sélecteur d'édition ──────────────────────────────────────────
  editionSection: {
    backgroundColor: Colors.surface,
    borderRadius: Layout.radius,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  editionLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  editionLoadingText: {
    color: Colors.textMuted,
    fontSize: 13,
  },
  editionToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Layout.padding,
  },
  editionToggleLabel: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  editionToggleChevron: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  editionList: {
    borderTopWidth: 1,
    borderColor: Colors.border,
  },
  editionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Layout.padding,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: Colors.border,
  },
  editionItemActive: {
    backgroundColor: Colors.surfaceElevated,
  },
  editionItemLeft: {
    flex: 1,
    gap: 2,
  },
  editionItemText: {
    color: Colors.textSecondary,
    fontSize: 13,
  },
  editionItemTextActive: {
    color: Colors.primary,
    fontWeight: '600',
  },
  editionItemRarity: {
    color: Colors.textMuted,
    fontSize: 11,
    fontStyle: 'italic',
  },
  editionItemRarityActive: {
    color: Colors.primary,
  },
  editionItemCode: {
    color: Colors.textMuted,
    fontSize: 12,
  },
  editionItemCodeActive: {
    color: Colors.primary,
  },

  // ─── Prix ─────────────────────────────────────────────────────────
  priceLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  priceLoadingText: {
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
