import { StyleSheet, Text, View } from 'react-native';

import { Colors } from '../../constants/colors';
import { Layout } from '../../constants/layout';
import type { CardLanguage } from '../../types/card';
import { LANGUAGE_LABEL } from '../../types/card';

type Props = {
  price: number | null;
  language?: CardLanguage;
  condition?: 'NM';
};

export function PriceTag({ price, language, condition = 'NM' }: Props) {
  const priceLabel =
    price !== null
      ? `${price.toFixed(2).replace('.', ',')} €`
      : 'Prix indisponible';

  const isAvailable = price !== null;

  return (
    <View style={styles.container}>
      {/* Badges condition + langue */}
      <View style={styles.badges}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{condition}</Text>
        </View>
        {language && (
          <View style={[styles.badge, styles.badgeLang]}>
            <Text style={styles.badgeText}>{LANGUAGE_LABEL[language]}</Text>
          </View>
        )}
        <Text style={styles.badgeLabel}>min</Text>
      </View>

      {/* Prix */}
      <View style={[styles.tag, !isAvailable && styles.tagUnavailable]}>
        <Text style={[styles.price, !isAvailable && styles.priceUnavailable]}>
          {priceLabel}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 6,
    alignSelf: 'flex-start',
  },
  badges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  badge: {
    backgroundColor: Colors.primary,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeLang: {
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  badgeText: {
    color: '#000',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  badgeLabel: {
    color: Colors.textMuted,
    fontSize: 10,
  },
  tag: {
    backgroundColor: Colors.surface,
    borderRadius: Layout.radiusSm,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  tagUnavailable: {
    borderColor: Colors.border,
  },
  price: {
    color: Colors.primary,
    fontSize: 22,
    fontWeight: '700',
  },
  priceUnavailable: {
    color: Colors.textMuted,
    fontSize: 14,
    fontWeight: '400',
  },
});
