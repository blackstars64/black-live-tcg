import { StyleSheet, Text, View } from 'react-native';

import { Colors } from '../../constants/colors';
import { Layout } from '../../constants/layout';

type Props = {
  name: string;
  set: string;
  game: string;
};

export function CardResult({ name, set, game }: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.gameBadge}>
        <Text style={styles.gameText}>{game}</Text>
      </View>
      <Text style={styles.name}>{name}</Text>
      <Text style={styles.set}>{set}</Text>
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
    gap: 6,
  },
  gameBadge: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.primary,
    borderRadius: Layout.radiusSm,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  gameText: {
    color: '#000',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  name: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  set: {
    color: Colors.textSecondary,
    fontSize: 14,
  },
});
