import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ScanButton } from '../../components/scanner/ScanButton';
import { ScanOverlay } from '../../components/scanner/ScanOverlay';
import { Colors } from '../../constants/colors';
import { Layout } from '../../constants/layout';

// TODO: remplacer par le type Card de types/card.ts (Session B)
type CardResult = {
  id: string;
  name: string;
  set: string;
  game: string;
};

export default function ScanScreen() {
  const [scanning, setScanning] = useState(false);
  const [cardFound, setCardFound] = useState<CardResult | null>(null);

  function handleScan() {
    setScanning(true);
    // TODO P1 : déclencher OCR ML Kit + identification API
    setTimeout(() => setScanning(false), 1500);
  }

  return (
    <View style={styles.container}>
      {/* Zone caméra — remplacée par VisionCamera en P1 */}
      <View style={styles.cameraPlaceholder}>
        <ScanOverlay active={scanning} />
        <Text style={styles.hint}>
          {scanning
            ? 'Analyse en cours...'
            : 'Pointez votre caméra vers une carte TCG'}
        </Text>
      </View>

      {cardFound && (
        <View style={styles.resultBanner}>
          <Text style={styles.resultText}>{cardFound.name}</Text>
          <Text style={styles.resultSub}>
            {cardFound.game} — {cardFound.set}
          </Text>
        </View>
      )}

      <View style={styles.controls}>
        <ScanButton onPress={handleScan} disabled={scanning} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  cameraPlaceholder: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: {
    color: Colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: Layout.paddingLg,
    position: 'absolute',
    bottom: Layout.paddingLg,
  },
  resultBanner: {
    backgroundColor: Colors.surface,
    padding: Layout.padding,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  resultText: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  resultSub: {
    color: Colors.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  controls: {
    alignItems: 'center',
    paddingVertical: Layout.paddingLg,
    backgroundColor: Colors.surface,
  },
});
