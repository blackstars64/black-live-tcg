import { Pressable, StyleSheet, Text } from 'react-native';

import { Colors } from '../../constants/colors';
import { Layout } from '../../constants/layout';

type Props = {
  onPress: () => void;
  disabled?: boolean;
};

export function ScanButton({ onPress, disabled = false }: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        disabled && styles.buttonDisabled,
        pressed && styles.buttonPressed,
      ]}
      accessibilityLabel="Scanner une carte"
      accessibilityRole="button"
    >
      <Text style={styles.icon}>📷</Text>
      <Text style={styles.label}>Scanner</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: Layout.scanButtonSize,
    height: Layout.scanButtonSize,
    borderRadius: Layout.scanButtonSize / 2,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  buttonDisabled: {
    backgroundColor: Colors.primaryDim,
    opacity: 0.6,
  },
  buttonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.96 }],
  },
  icon: {
    fontSize: 22,
  },
  label: {
    color: '#000',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
