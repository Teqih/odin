import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import Backend from 'i18next-http-backend';

// Translation resources
const resources = {
  en: {
    translation: {
      // Home screen
      "app.title": "Odin Card Game",
      "app.description": "A turn-based multiplayer card game where strategy meets luck.",
      "button.createGame": "Create Game",
      "button.joinGame": "Join Game",
      "howToPlay.title": "How to Play",
      "howToPlay.rule1": "Players are dealt cards from a 54-card deck (6 colors, numbered 1-9). Up to 6 players get 9 cards each, larger games get fewer cards.",
      "howToPlay.rule2": "On your turn, play one or more cards of the same number or color.",
      "howToPlay.rule3": "Other players must match with higher value cards or pass.",
      "howToPlay.rule4": "After a play, pick up one card from previous play.",
      "howToPlay.rule5": "First to empty their hand wins the round.",
      "howToPlay.rule6": "Score 1 point per card left in hand.",
      "howToPlay.rule7": "Game ends when a player reaches the point limit.",
      
      // Join/Create screens
      "create.title": "Create Game",
      "create.nameLabel": "Your Name",
      "create.namePlaceholder": "Enter your name",
      "create.pointsLimit": "Points Limit",
      "create.dealCards": "Deal Cards",
      "create.startGame": "Start Game",
      "create.creating": "Creating...",
      "create.shareCode": "Share this code with friends:",
      "create.copyCode": "Copy Code",
      "create.goToLobby": "Go to Lobby",
      "create.nameRequired": "Name required",
      "create.pleaseEnterName": "Please enter your name",
      "create.failedToCreate": "Failed to create game",
      "create.tryAgain": "Please try again",
      "create.copied": "Copied!",
      "create.codeCopied": "Room code copied to clipboard",
      "join.title": "Join Game",
      "join.roomCode": "Room Code",
      "join.roomCodePlaceholder": "Enter room code",
      "join.joinGame": "Join Game",
      "join.back": "Back",
      "join.joining": "Joining...",
      "join.nameRequired": "Please enter your name",
      "join.codeRequired": "Please enter a room code",
      "join.gameFull": "Game is full (maximum 27 players)",
      "join.invalidCode": "Invalid room code or game not found",
      
      // Game screens
      "game.players": "Players",
      "game.yourTurn": "Your Turn",
      "game.waitingTurn": "Waiting for your turn...",
      "game.playCards": "Play Cards",
      "game.pass": "Pass",
      "game.round": "Round {{round}}",
      "game.score": "Score: {{score}}",
      "game.chat": "Chat",
      "game.send": "Send",
      "game.lobby": "Lobby",
      "game.waitingForPlayers": "Waiting for players to join...",
      "game.startGame": "Start Game",
      "game.leaveLobby": "Leave Lobby",
      "game.youAreHost": "You are the host",
      "game.leaveGame": "Leave Game",
      "game.loading": "Loading lobby...",
      "game.errorTitle": "Error Loading Lobby",
      "game.errorMessage": "Unable to join the game lobby. The game may no longer exist.",
      "game.backToHome": "Back to Home",
      "game.notEnoughPlayers": "Not enough players",
      "game.needTwoPlayers": "You need at least 2 players to start the game",
      "game.playerYou": "You",
      "game.playerHost": "Host",
      
      // Language
      "language": "Language",
      "language.english": "English",
      "language.french": "French",
    }
  },
  fr: {
    translation: {
      // Écran d'accueil
      "app.title": "Jeu de Cartes Odin",
      "app.description": "Un jeu de cartes multijoueur au tour par tour où stratégie et chance se rencontrent.",
      "button.createGame": "Créer une Partie",
      "button.joinGame": "Rejoindre une Partie",
      "howToPlay.title": "Comment Jouer",
      "howToPlay.rule1": "Les joueurs reçoivent des cartes d'un jeu de 54 cartes (6 couleurs, numérotées de 1 à 9). Jusqu'à 6 joueurs reçoivent 9 cartes chacun, les parties plus grandes reçoivent moins de cartes.",
      "howToPlay.rule2": "À votre tour, jouez une ou plusieurs cartes du même numéro ou de la même couleur.",
      "howToPlay.rule3": "Les autres joueurs doivent suivre avec des cartes de valeur supérieure ou passer leur tour.",
      "howToPlay.rule4": "Après avoir joué, prenez une carte du jeu précédent.",
      "howToPlay.rule5": "Le premier à vider sa main gagne la manche.",
      "howToPlay.rule6": "Marquez 1 point par carte restante en main.",
      "howToPlay.rule7": "La partie se termine lorsqu'un joueur atteint la limite de points.",
      
      // Écrans Rejoindre/Créer
      "create.title": "Créer une Partie",
      "create.nameLabel": "Votre Nom",
      "create.namePlaceholder": "Entrez votre nom",
      "create.pointsLimit": "Limite de Points",
      "create.dealCards": "Distribuer les Cartes",
      "create.startGame": "Commencer la Partie",
      "create.creating": "Création en cours...",
      "create.shareCode": "Partagez ce code avec vos amis :",
      "create.copyCode": "Copier le Code",
      "create.goToLobby": "Aller au Salon",
      "create.nameRequired": "Nom requis",
      "create.pleaseEnterName": "Veuillez entrer votre nom",
      "create.failedToCreate": "Échec de la création de la partie",
      "create.tryAgain": "Veuillez réessayer",
      "create.copied": "Copié !",
      "create.codeCopied": "Code de salon copié dans le presse-papiers",
      "join.title": "Rejoindre une Partie",
      "join.roomCode": "Code de Salle",
      "join.roomCodePlaceholder": "Entrez le code de salle",
      "join.joinGame": "Rejoindre la Partie",
      "join.back": "Retour",
      "join.joining": "Connexion en cours...",
      "join.nameRequired": "Veuillez entrer votre nom",
      "join.codeRequired": "Veuillez entrer un code de salle",
      "join.gameFull": "La partie est complète (maximum 27 joueurs)",
      "join.invalidCode": "Code de salle invalide ou partie introuvable",
      
      // Écrans de jeu
      "game.players": "Joueurs",
      "game.yourTurn": "Votre Tour",
      "game.waitingTurn": "En attente de votre tour...",
      "game.playCards": "Jouer les Cartes",
      "game.pass": "Passer",
      "game.round": "Manche {{round}}",
      "game.score": "Score: {{score}}",
      "game.chat": "Chat",
      "game.send": "Envoyer",
      "game.lobby": "Salon",
      "game.waitingForPlayers": "En attente d'autres joueurs...",
      "game.startGame": "Commencer la Partie",
      "game.leaveLobby": "Quitter le Salon",
      "game.youAreHost": "Vous êtes l'hôte",
      "game.leaveGame": "Quitter la Partie",
      "game.loading": "Chargement du salon...",
      "game.errorTitle": "Erreur de Chargement du Salon",
      "game.errorMessage": "Impossible de rejoindre le salon de jeu. La partie n'existe peut-être plus.",
      "game.backToHome": "Retour à l'Accueil",
      "game.notEnoughPlayers": "Pas assez de joueurs",
      "game.needTwoPlayers": "Vous avez besoin d'au moins 2 joueurs pour commencer la partie",
      "game.playerYou": "Vous",
      "game.playerHost": "Hôte",
      
      // Langue
      "language": "Langue",
      "language.english": "Anglais",
      "language.french": "Français",
    }
  }
};

i18n
  .use(Backend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    debug: process.env.NODE_ENV === 'development',
    interpolation: {
      escapeValue: false, // not needed for React
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
  });

export default i18n; 