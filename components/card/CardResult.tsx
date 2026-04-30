import { StyleSheet, Text, View } from 'react-native';

import { Colors } from '../../constants/colors';
import { Layout } from '../../constants/layout';
import type { CardLanguage, GameType } from '../../types/card';
import { LANGUAGE_LABEL } from '../../types/card';

const GAME_LABEL: Record<GameType, string> = {
  mtg: 'Magic: The Gathering',
  pokemon: 'Pokémon TCG',
  yugioh: 'Yu-Gi-Oh',
};

type Props = {
  name: string;       // Nom dans la langue scannée
  nameEn: string;     // Nom anglais (référence)
  set: string;        // Nom de l'édition
  setCode: string;    // Code court de l'édition
  number: string;     // Numéro dans l'édition
  game: GameType;
  language: CardLanguage;
};

export function CardResult({ name, nameEn, set, setCode, number, game, language }: Props) {
  const showEnName = name.toLowerCase() !== nameEn.toLowerCase();
  const langLabel = LANGUAGE_LABEL[language];

  return (
    <View style={styles.card}>
      {/* En-tête : jeu + langue */}
      <View style={styles.header}>
        <View style={styles.gameBadge}>
          <Text style={styles.gameText}>{GAME_LABEL[game]}</Text>
        </View>
        <View style={styles.langBadge}>
          <Text style={styles.langText}>{langLabel}</Text>
        </View>
      </View>

      {/* Nom dans la langue scannée */}
      <Text style={styles.name}>{name}</Text>

      {/* Nom EN si différent (carte non-EN) */}
      {showEnName && (
        <Text style={styles.nameEn}>{nameEn}</Text>
      )}

      {/* Édition + numéro */}
      {set ? (
        <View style={styles.setRow}>
          <Text style={styles.set}>{set}</Text>
          {setCode || number ? (
            <Text style={styles.setCode}>
              {[setCode, number].filter(Boolean).join(' · ')}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Layout.radius,
    padding: Layout.padding,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  gameBadge: {
    backgroundColor: Colors.primary,
    borderRadius: Layout.radiusSm,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  gameText: {
    color: '#000',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  langBadge: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Layout.radiusSm,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  langText: {
    color: Colors.primary,
    fontSize: 11,
    fontWeight: '700',
  },
  name: {
    color: Colors.text,
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 28,
  },
  nameEn: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontStyle: 'italic',
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  set: {
    color: Colors.textSecondary,
    fontSize: 14,
  },
  setCode: {
    color: Colors.textMuted,
    fontSize: 12,
  },
});
