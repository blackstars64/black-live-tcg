// ─── Écran Scanner — P1 ──────────────────────────────────────────
// Caméra expo-camera + sélecteur jeu + pipeline OCR via useCardScanner
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';

// ─── Composants ───────────────────────────────────────────────────
import { ScanButton } from '../../components/scanner/ScanButton';
import { ScanOverlay } from '../../components/scanner/ScanOverlay';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';

// ─── Store / hooks ────────────────────────────────────────────────
import { useCardScanner } from '../../hooks/useCardScanner';
import { useHistoryStore } from '../../store';

// ─── Constantes ───────────────────────────────────────────────────
import { Colors } from '../../constants/colors';
import type { GameType } from '../../types/card';

const GAMES: { id: GameType; label: string }[] = [
  { id: 'mtg', label: 'Magic' },
  { id: 'pokemon', label: 'Pokémon' },
  { id: 'yugioh', label: 'Yu-Gi-Oh' },
];

export default function ScanScreen() {
  const router = useRouter();
  const cameraRef = useRef<CameraView>(null);
  const [selectedGame, setSelectedGame] = useState<GameType>('mtg');
  const [permission, requestPermission] = useCameraPermissions();

  const { isScanning, currentResult, error, scanCard, reset } = useCardScanner();
  const { addScan } = useHistoryStore();

  // Navigation automatique vers le résultat quand un scan réussit
  useEffect(() => {
    if (currentResult) {
      addScan(currentResult);
      router.push(`/result/${currentResult.card.id}`);
      reset();
    }
  }, [currentResult]);

  async function handleScan(): Promise<void> {
    if (!cameraRef.current || isScanning) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.85,
        base64: false,
        skipProcessing: false,
      });
      await scanCard(photo.uri, selectedGame);
    } catch {
      // erreur propagée via le store
    }
  }

  // ─── Permission non encore déterminée ────────────────────────────
  if (!permission) {
    return (
      <View style={styles.container}>
        <LoadingSpinner />
      </View>
    );
  }

  // ─── Permission refusée ───────────────────────────────────────────
  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionText}>
          L'accès à la caméra est requis pour scanner vos cartes.
        </Text>
        <Pressable style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>Autoriser la caméra</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Caméra plein écran */}
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        ratio="4:3"
      />

      {/* Overlay cadre de scan */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <ScanOverlay active={isScanning} />
      </View>

      {/* Sélecteur de jeu */}
      <View style={styles.gameSelector}>
        {GAMES.map((game) => (
          <Pressable
            key={game.id}
            style={[styles.gamePill, selectedGame === game.id && styles.gamePillActive]}
            onPress={() => setSelectedGame(game.id)}
          >
            <Text
              style={[
                styles.gamePillText,
                selectedGame === game.id && styles.gamePillTextActive,
              ]}
            >
              {game.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Bouton scan */}
      <View style={styles.scanButtonContainer}>
        <ScanButton onPress={handleScan} disabled={isScanning} />
      </View>

      {/* Overlay de traitement */}
      {isScanning && (
        <View style={styles.scanningOverlay}>
          <LoadingSpinner />
          <Text style={styles.scanningText}>Identification en cours…</Text>
        </View>
      )}

      {/* Banner d'erreur (dismiss au tap) */}
      {error && (
        <Pressable style={styles.errorBanner} onPress={reset}>
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.errorDismiss}>✕</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  gameSelector: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    zIndex: 10,
    paddingHorizontal: 16,
  },
  gamePill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  gamePillActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  gamePillText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  gamePillTextActive: {
    color: '#000',
  },
  scanButtonContainer: {
    position: 'absolute',
    bottom: 48,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  scanningOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    zIndex: 20,
  },
  scanningText: {
    color: Colors.text,
    fontSize: 16,
  },
  errorBanner: {
    position: 'absolute',
    bottom: 130,
    left: 16,
    right: 16,
    backgroundColor: Colors.error,
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 20,
  },
  errorText: {
    color: '#fff',
    fontSize: 14,
    flex: 1,
  },
  errorDismiss: {
    color: '#fff',
    fontSize: 16,
    marginLeft: 8,
  },
  permissionContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 24,
  },
  permissionText: {
    color: Colors.textSecondary,
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },
  permissionButton: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  permissionButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '700',
  },
});
