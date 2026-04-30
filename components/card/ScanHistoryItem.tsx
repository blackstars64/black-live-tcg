// ─── Item liste historique ────────────────────────────────────────
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors } from '../../constants/colors';
import { Layout } from '../../constants/layout';
import type { ScanResult } from '../../types';
import { LANGUAGE_LABEL } from '../../types/card';

const GAME_LABEL = { mtg: 'MTG', pokemon: 'PKM', yugioh: 'YGO' } as const;
const GAME_COLOR = {
  mtg: '#E8C547',
  pokemon: '#EF5350',
  yugioh: '#7E57C2',
} as const;

type Props = {
  scan: ScanResult;
  onPress: () => void;
};

export function ScanHistoryItem({ scan, onPress }: Props) {
  const { card, price, confidence, scannedAt } = scan;
  const gameColor = GAME_COLOR[card.game];
  const timeLabel = new Date(scannedAt).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const dateLabel = new Date(scannedAt).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
  });

  return (
    <Pressable
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
      onPress={onPress}
    >
      {/* Barre de couleur jeu à gauche */}
      <View style={[styles.gameBar, { backgroundColor: gameColor }]} />

      <View style={styles.content}>
        {/* Ligne 1 : badges + heure */}
        <View style={styles.topRow}>
          <View style={styles.badges}>
            <View style={[styles.gameBadge, { backgroundColor: gameColor }]}>
              <Text style={styles.gameBadgeText}>{GAME_LABEL[card.game]}</Text>
            </View>
            <View style={styles.langBadge}>
              <Text style={styles.langBadgeText}>{LANGUAGE_LABEL[card.language]}</Text>
            </View>
          </View>
          <Text style={styles.time}>{dateLabel} · {timeLabel}</Text>
        </View>

        {/* Ligne 2 : nom carte */}
        <Text style={styles.cardName} numberOfLines={1}>{card.name}</Text>
        {card.name !== card.nameEn && (
          <Text style={styles.cardNameEn} numberOfLines={1}>{card.nameEn}</Text>
        )}

        {/* Ligne 3 : édition + prix */}
        <View style={styles.bottomRow}>
          <Text style={styles.set} numberOfLines={1}>
            {card.set || 'Édition inconnue'}
            {card.number ? ` · ${card.number}` : ''}
          </Text>
          {price?.priceNmLow != null ? (
            <View style={styles.priceChip}>
              <Text style={styles.priceCondition}>NM</Text>
              <Text style={styles.priceValue}>
                {price.priceNmLow.toFixed(2).replace('.', ',')} €
              </Text>
            </View>
          ) : (
            <Text style={styles.priceUnavailable}>—</Text>
          )}
        </View>

        {/* Barre de confiance OCR */}
        <View style={styles.confidenceBar}>
          <View
            style={[
              styles.confidenceFill,
              {
                width: `${Math.round(confidence * 100)}%` as `${number}%`,
                backgroundColor: confidence >= 0.7 ? Colors.success : Colors.primary,
              },
            ]}
          />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: Layout.radius,
    marginHorizontal: Layout.padding,
    marginBottom: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pressed: {
    opacity: 0.75,
  },
  gameBar: {
    width: 4,
  },
  content: {
    flex: 1,
    padding: 12,
    gap: 4,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  badges: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  gameBadge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  gameBadgeText: {
    color: '#000',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  langBadge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceElevated,
  },
  langBadgeText: {
    color: Colors.textSecondary,
    fontSize: 10,
    fontWeight: '700',
  },
  time: {
    color: Colors.textMuted,
    fontSize: 11,
  },
  cardName: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  cardNameEn: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontStyle: 'italic',
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  set: {
    color: Colors.textSecondary,
    fontSize: 12,
    flex: 1,
    marginRight: 8,
  },
  priceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  priceCondition: {
    color: Colors.textMuted,
    fontSize: 9,
    fontWeight: '700',
  },
  priceValue: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  priceUnavailable: {
    color: Colors.textMuted,
    fontSize: 13,
  },
  confidenceBar: {
    height: 2,
    backgroundColor: Colors.border,
    borderRadius: 1,
    marginTop: 6,
    overflow: 'hidden',
  },
  confidenceFill: {
    height: 2,
    borderRadius: 1,
  },
});
