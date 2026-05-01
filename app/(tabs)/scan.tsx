// ─── Écran Scanner ────────────────────────────────────────────────
import { useEffect, useRef, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';

import { ScanButton } from '../../components/scanner/ScanButton';
import { ScanOverlay } from '../../components/scanner/ScanOverlay';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { useCardScanner } from '../../hooks/useCardScanner';
import { useHistoryStore } from '../../store';
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
  const [selectedGame, setSelectedGame] = useState<GameType>('pokemon');

  // Charger le dernier jeu sélectionné au démarrage
  useEffect(() => {
    AsyncStorage.getItem('lastGame').then((saved) => {
      if (saved === 'mtg' || saved === 'pokemon' || saved === 'yugioh') {
        setSelectedGame(saved);
      }
    });
  }, []);

  const handleSelectGame = useCallback((game: GameType) => {
    setSelectedGame(game);
    AsyncStorage.setItem('lastGame', game);
  }, []);
  const [permission, requestPermission] = useCameraPermissions();
  const [manualName, setManualName] = useState('');
  const [showManual, setShowManual] = useState(false);

  const { isScanning, currentResult, error, scanCard, scanByName, reset } = useCardScanner();
  const { addScan } = useHistoryStore();

  useEffect(() => {
    if (currentResult) {
      addScan(currentResult);
      router.push(`/result/${currentResult.card.id}`);
      reset();
      setManualName('');
      setShowManual(false);
    }
  }, [currentResult]);

  async function handleScan(): Promise<void> {
    if (!cameraRef.current || isScanning) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.9,
        base64: false,
        skipProcessing: false,
      });
      await scanCard(photo.uri, selectedGame);
    } catch {
      // erreur propagée via le store
    }
  }

  async function handleManualSearch(): Promise<void> {
    if (!manualName.trim() || isScanning) return;
    Keyboard.dismiss();
    await scanByName(manualName.trim(), selectedGame);
  }

  if (!permission) return <View style={styles.container}><LoadingSpinner /></View>;

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
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Caméra plein écran */}
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" ratio="4:3" />

      {/* Overlay cadre */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <ScanOverlay active={isScanning} />
      </View>

      {/* Sélecteur de jeu */}
      <View style={styles.gameSelector}>
        {GAMES.map((game) => (
          <Pressable
            key={game.id}
            style={[styles.gamePill, selectedGame === game.id && styles.gamePillActive]}
            onPress={() => handleSelectGame(game.id)}
          >
            <Text style={[styles.gamePillText, selectedGame === game.id && styles.gamePillTextActive]}>
              {game.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Bas de l'écran : bouton scan + recherche manuelle */}
      <View style={styles.bottomContainer}>
        {/* Recherche manuelle (toggle) */}
        {showManual ? (
          <View style={styles.manualContainer}>
            <TextInput
              style={styles.manualInput}
              value={manualName}
              onChangeText={setManualName}
              placeholder="Nom de la carte..."
              placeholderTextColor={Colors.textMuted}
              autoFocus
              returnKeyType="search"
              onSubmitEditing={handleManualSearch}
            />
            <Pressable
              style={[styles.manualSearchBtn, !manualName.trim() && styles.manualSearchBtnDisabled]}
              onPress={handleManualSearch}
              disabled={!manualName.trim() || isScanning}
            >
              <Text style={styles.manualSearchBtnText}>Rechercher</Text>
            </Pressable>
            <Pressable onPress={() => { setShowManual(false); setManualName(''); reset(); }}>
              <Text style={styles.manualCancelText}>Annuler</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.scanRow}>
            <ScanButton onPress={handleScan} disabled={isScanning} />
            <Pressable style={styles.manualToggle} onPress={() => { reset(); setShowManual(true); }}>
              <Text style={styles.manualToggleText}>✏️ Saisie manuelle</Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* Spinner traitement */}
      {isScanning && (
        <View style={styles.scanningOverlay}>
          <LoadingSpinner />
          <Text style={styles.scanningText}>Identification en cours…</Text>
        </View>
      )}

      {/* Banner erreur */}
      {error && !showManual && (
        <Pressable style={styles.errorBanner} onPress={() => { reset(); setShowManual(true); }}>
          <Text style={styles.errorText}>{error} — Tap pour saisir manuellement</Text>
          <Text style={styles.errorDismiss}>✕</Text>
        </Pressable>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
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
  gamePillActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  gamePillText: { color: Colors.textSecondary, fontSize: 13, fontWeight: '600' },
  gamePillTextActive: { color: '#000' },
  bottomContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    paddingBottom: 36,
    alignItems: 'center',
  },
  scanRow: {
    alignItems: 'center',
    gap: 16,
  },
  manualToggle: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  manualToggleText: { color: Colors.textSecondary, fontSize: 13 },
  manualContainer: {
    width: '100%',
    paddingHorizontal: 20,
    gap: 10,
    backgroundColor: Colors.surface,
    paddingTop: 16,
    paddingBottom: 8,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  manualInput: {
    width: '100%',
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: Colors.text,
    fontSize: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  manualSearchBtn: {
    width: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  manualSearchBtnDisabled: { opacity: 0.4 },
  manualSearchBtnText: { color: '#000', fontWeight: '700', fontSize: 16 },
  manualCancelText: { color: Colors.textMuted, fontSize: 14, paddingVertical: 8 },
  scanningOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    zIndex: 20,
  },
  scanningText: { color: Colors.text, fontSize: 16 },
  errorBanner: {
    position: 'absolute',
    bottom: 160,
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
  errorText: { color: '#fff', fontSize: 13, flex: 1 },
  errorDismiss: { color: '#fff', fontSize: 16, marginLeft: 8 },
  permissionContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 24,
  },
  permissionText: { color: Colors.textSecondary, fontSize: 16, textAlign: 'center', lineHeight: 24 },
  permissionButton: { backgroundColor: Colors.primary, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 14 },
  permissionButtonText: { color: '#000', fontSize: 16, fontWeight: '700' },
});
