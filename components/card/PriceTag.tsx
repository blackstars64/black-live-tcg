import { StyleSheet, Text, View } from 'react-native';

import { Colors } from '../../constants/colors';
import { Layout } from '../../constants/layout';

type Props = {
  price: number | null;
  currency?: string;
};

export function PriceTag({ price, currency = '€' }: Props) {
  const label =
    price !== null
      ? `${price.toFixed(2).replace('.', ',')} ${currency}`
      : 'Prix indisponible';

  const isAvailable = price !== null;

  return (
    <View style={[styles.tag, !isAvailable && styles.tagUnavailable]}>
      <Text style={styles.icon}>{isAvailable ? '💰' : '—'}</Text>
      <Text style={[styles.price, !isAvailable && styles.priceUnavailable]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.surface,
    borderRadius: Layout.radiusSm,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: Colors.primary,
    alignSelf: 'flex-start',
  },
  tagUnavailable: {
    borderColor: Colors.border,
  },
  icon: {
    fontSize: 16,
  },
  price: {
    color: Colors.primary,
    fontSize: 18,
    fontWeight: '700',
  },
  priceUnavailable: {
    color: Colors.textMuted,
    fontSize: 14,
    fontWeight: '400',
  },
});
