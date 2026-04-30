# BlackLiveTCG

App mobile de scan de cartes TCG avec estimation de prix.

**Jeux supportés :** Magic: The Gathering · Pokémon TCG · Yu-Gi-Oh

## Stack

- Expo (React Native) + TypeScript
- Expo Router (navigation)
- Zustand (state)
- Google ML Kit (OCR on-device)
- SQLite (cache local)
- Cardmarket API (prix)

## Lancer le projet

```bash
npm install
npm run android   # Android
npm run ios       # iOS (macOS requis)
```

## Phases de développement

- [x] P0 — Setup architecture
- [ ] P1 — Scanner caméra + OCR
- [ ] P2 — Identification API (Scryfall MTG)
- [ ] P3 — Cache SQLite
- [ ] P4 — Cardmarket API (prix)
- [ ] P5 — Multi-jeux (Pokémon + Yu-Gi-Oh)
- [ ] P6 — Scan multi-cartes + AR overlay
