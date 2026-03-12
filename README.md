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

## � Installation & Utilisation

Pour installer et utiliser BhilBrowser, suivez ces étapes simples :

### 1. Cloner le projet
```bash
git clone https://github.com/7Bhil/BhilBrowser.git
cd BhilBrowser
```

### 2. Installer les dépendances
```bash
npm install
```

### 3. Lancer le navigateur
```bash
npm start
```

---

## 📦 Créer votre propre exécutable (Build)

Si vous souhaitez transformer le code en une application installable sur votre ordinateur :

### 🐧 Linux (AppImage & .deb)
```bash
npm run dist:linux
```
*Le fichier installable sera généré dans le dossier `dist/`.*

### 🪟 Windows (.exe)
```bash
npm run dist:win
```

### 🍎 macOS (.dmg)
```bash
npm run dist:mac
```

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
