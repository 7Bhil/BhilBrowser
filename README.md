<p align="center">
  <img src="src/assets/icon.png" width="120" alt="BhilBrowser Logo">
</p>

<h1 align="center">BhilBrowser</h1>
<p align="center">
  <b>Un navigateur web moderne, rapide et élégant construit avec Electron.</b><br>
  Bloqueur de pub intégré • Mode privé • Tableau de bord personnalisé • Gestion des favoris
</p>

<p align="center">
  <img alt="GitHub stars" src="https://img.shields.io/github/stars/7Bhil/BhilBrowser?style=flat-square">
  <img alt="GitHub license" src="https://img.shields.io/github/license/7Bhil/BhilBrowser?style=flat-square">
  <img alt="Electron" src="https://img.shields.io/badge/Electron-v41-blue?style=flat-square&logo=electron">
</p>

---

## ✨ Fonctionnalités

- 🛡️ **Bloqueur de publicités** intégré avec compteur en temps réel
- 🕵️ **Mode navigation privée** isolé
- 🏠 **Dashboard personnalisé** avec horloge, historique et favoris
- 🎨 **Thème sombre / clair** avec transition fluide
- 📌 **Onglets épinglés** persistants entre les sessions
- 🔖 **Favoris et historique** sauvegardés localement
- ⬇️ **Gestionnaire de téléchargements** intégré
- 🔍 **Suggestions de recherche** multi-moteurs (Google, DuckDuckGo, Bing…)

---

## 📦 Installation

> Choisissez votre système d'exploitation :

### 🐧 Linux

#### Option 1 — Depuis les releases GitHub (Recommandé)
```bash
# Télécharger la dernière version AppImage
wget https://github.com/7Bhil/BhilBrowser/releases/latest/download/BhilBrowser.AppImage

# Rendre exécutable et lancer
chmod +x BhilBrowser.AppImage
./BhilBrowser.AppImage
```

#### Option 2 — Installer le paquet .deb (Ubuntu/Debian)
```bash
wget https://github.com/7Bhil/BhilBrowser/releases/latest/download/BhilBrowser.deb
sudo dpkg -i BhilBrowser.deb
```

#### Option 3 — Depuis le code source
```bash
git clone https://github.com/7Bhil/BhilBrowser.git
cd BhilBrowser
npm install
npm start
```

---

### 🪟 Windows

#### Option 1 — Installer depuis les releases
1. Téléchargez `BhilBrowser-Setup.exe` depuis la [page des releases](https://github.com/7Bhil/BhilBrowser/releases/latest)
2. Lancez l'installateur et suivez les étapes

#### Option 2 — Depuis le code source
```powershell
git clone https://github.com/7Bhil/BhilBrowser.git
cd BhilBrowser
npm install
npm start
```

---

### 🍎 macOS

#### Option 1 — Installer depuis les releases
1. Téléchargez `BhilBrowser.dmg` depuis la [page des releases](https://github.com/7Bhil/BhilBrowser/releases/latest)
2. Ouvrez le `.dmg` et glissez **BhilBrowser** dans votre dossier Applications

#### Option 2 — Depuis le code source
```bash
git clone https://github.com/7Bhil/BhilBrowser.git
cd BhilBrowser
npm install
npm start
```

---

## 🛠️ Développement

### Prérequis
- [Node.js](https://nodejs.org/) v18+
- npm v9+

### Lancer en mode développement
```bash
git clone https://github.com/7Bhil/BhilBrowser.git
cd BhilBrowser
npm install
npm start
```

### Compiler les builds
```bash
# Linux (AppImage + .deb)
npm run dist:linux

# Windows (.exe)
npm run dist:win

# macOS (.dmg)
npm run dist:mac
```

Les fichiers générés se trouvent dans le dossier `dist/`.

---

## 📁 Structure du projet
```
BhilBrowser/
├── main.js          # Processus principal Electron
├── src/
│   ├── index.html   # Interface principale du navigateur
│   ├── dashboard.html # Page d'accueil personnalisée
│   ├── renderer.js  # Logique de l'interface
│   ├── preload.js   # Pont sécurisé IPC
│   ├── store.js     # Gestion des données locales
│   └── assets/      # Images et ressources
└── package.json
```

---

## 📄 Licence

MIT © [7Bhil](https://github.com/7Bhil)
