# Project Architecture Overview

This document outlines the architecture of the OdinCardClash project. 
If you find any missing or incorrect information in this document, please update it to ensure accuracy and completeness.

## Structure

The project follows a monorepo structure with three main directories:

1.  **`client/`**: Contains the frontend React application.
2.  **`server/`**: Contains the backend Node.js/Express application.
3.  **`shared/`**: Contains code shared between the client and server, primarily TypeScript types and schemas.

## Server (`server/`)

The server is built using Node.js and Express. It handles game logic, manages game state, and communicates with clients via HTTP API endpoints and WebSockets.

*   **`index.ts`**: The main entry point for the server. Sets up the Express app, WebSocket server, and integrates routes.
*   **`routes.ts`**: Defines the HTTP API routes for actions like creating games, joining games, playing cards, passing turns, etc. It uses Zod for request validation. Also handles WebSocket message routing and broadcasts events to game participants.
*   **`game.ts`**: Contains the core game logic, including functions for creating and shuffling decks, dealing cards, validating plays (`isValidPlay`), calculating scores (`calculateRoundScores`), and managing rounds (`startNewRound`).
*   **`storage.ts`**: Manages the persistence of game state. The current implementation (`MemStorage`) stores game data in memory. It provides methods for creating, retrieving, and updating game and player data, as well as chat message and voice message storage.
*   **`vite.ts`**: Handles integration with Vite, likely for serving the client application in development or managing server-side rendering aspects if applicable.

### Server Storage Implementation

The `MemStorage` class in `storage.ts` handles various aspects of game data:

* **Game State**: Stores complete game state including players, cards, and round information
* **Room Codes**: Maps short room codes to internal game IDs
* **Chat History**: Maintains chat message history per game with a 100-message limit
* **Voice Messages**: Stores voice message binary data with TTL (time-to-live) cleanup

### WebSocket Communication

The server uses the `ws` library for WebSocket communication with a custom implementation:

* **Connection Management**: Tracks active connections in a map of game ID → player ID → WebSocket
* **Message Routing**: Routes different message types (game state updates, chat messages, etc.)
* **Connection Health**: Implements ping/pong for connection health monitoring
* **Reconnection Logic**: Handles player reconnection and game state synchronization

## Client (`client/`)

The client is a single-page application built with React and Vite. It interacts with the server API to send player actions and receives real-time game state updates via WebSockets.

*   **`index.html`**: The main HTML entry point.
*   **`src/main.tsx`**: The entry point for the React application, rendering the root `App` component.
*   **`src/App.tsx`**: The root React component, responsible for setting up routing (using `wouter`) and global providers.
*   **`src/components/`**: Contains reusable UI components organized in several categories:
    * **`ui/`**: Core UI components (buttons, cards, inputs, etc.)
    * **`modals/`**: Modal components (round end, game end, card picking, etc.)
    * Game-specific components (lobby screen, game screen, etc.)
*   **`src/pages/`**: Contains top-level components for different application views (e.g., `Home`, `Game`).
*   **`src/hooks/`**: Custom React hooks for component logic, including:
    * **`useAudioRecorder`**: Manages microphone access and voice recording
    * **`useToast`**: Notification system
    * Query and mutation hooks for API interactions
*   **`src/lib/`**: Utility functions, API client setup, and WebSocket connection management:
    * **`websocket.ts`**: Handles WebSocket connection, reconnection, and message dispatching
    * **`queryClient.ts`**: React Query setup and API request utilities
    * **`card-utils.ts`**: Card validation and sorting utilities
*   **`src/styles/`**: CSS files including animations and UI component styles.

### Component Organization

The client follows a component-based architecture with:

1. **Screen Components**: Top-level views (CreateGameScreen, LobbyScreen, GameScreen)
2. **Feature Components**: Domain-specific components (ChatPanel, PlayerHand)
3. **UI Components**: Reusable UI elements (Button, Card, Input)
4. **Modal Components**: Dialog screens for game events (RoundEndModal, GameEndModal)
5. **Shared Components**: Used across multiple screens (ChatButton, RoomCodeDisplay)

### Game Flow and State Management

Game flow follows several distinct states:

1. **Home**: Entry point with options to create or join a game
2. **Game Creation**: Form to set up a new game with configurable options
3. **Lobby**: Waiting room where players join before the game starts
4. **Gameplay**: The main game interface with player turns and card interactions
5. **Round End**: Displayed when a player empties their hand, showing scores
6. **Game End**: Shown when a player reaches the point limit

State management uses:
* **React Query**: For API data fetching and caching
* **Local Component State**: For UI state
* **WebSocket Events**: For real-time updates
* **Session Storage**: For persisting game credentials between page refreshes

## Chat and Voice Messaging System

The project includes a complete chat system with text and voice messaging:

### Text Chat
* Available across all game states (lobby, gameplay, round end)
* Real-time message broadcasting via WebSockets
* Unread message tracking with badge indicators

### Voice Messaging
* Uses the MediaRecorder API to capture audio from the user's microphone
* Uploads audio as WebM format to the server via form data
* Server stores voice messages with TTL for automatic cleanup
* Client-side playback with progress tracking and waveform visualization

### Chat UI Components
* **`ChatPanel`**: Main chat interface with message list and input
* **`ChatButton`**: Floating button with unread count indicator
* **`VoiceMessage`**: Audio message player with playback controls

## Shared (`shared/`)

This directory contains code intended to be used by both the client and server.

*   **`schema.ts`**: Defines shared TypeScript interfaces and Zod schemas for:
    * Game state structures (`GameState`, `Player`, `Card`)
    * API request/response types
    * WebSocket message types
    * Chat message interfaces with support for both text and voice messages

## Technology Stack

*   **Frontend**: React, Vite, TypeScript, Tailwind CSS, `tanstack/react-query`, `wouter` (routing)
*   **Backend**: Node.js, Express, TypeScript, `ws` (WebSockets), Zod, Multer (file uploads)
*   **Shared**: TypeScript, Zod
*   **Audio**: Web Audio API, MediaRecorder API
*   **Build/Tooling**: Vite, npm

## Communication Flow

1.  Client connects to the server via HTTP and WebSocket.
2.  Player actions (join game, play card, chat, etc.) are sent either via:
    * HTTP POST requests to the API endpoints for game actions
    * WebSocket messages for real-time events like chat messages
    * FormData uploads for voice messages
3.  The server validates the request, updates the appropriate state, and stores data in `MemStorage`.
4.  The server broadcasts updates to all connected clients in the relevant game room via WebSockets.
5.  The client receives WebSocket messages and updates the UI accordingly.
6.  Connection health is maintained through ping/pong messages, with automatic reconnection attempts.

## Modifying the System

When making changes to the OdinCardClash system, consider the following guidelines:

1. **Add New Game Features**:
   * Update `schema.ts` to add new types or extend existing ones
   * Add game logic in `server/game.ts`
   * Extend storage methods in `server/storage.ts`
   * Add API endpoints in `server/routes.ts`
   * Implement UI components in `client/src/components/`

2. **Extend Chat Features**:
   * For new message types, update the `MessageType` enum in `schema.ts`
   * Add storage methods in `storage.ts` for new data types
   * Extend `ChatPanel.tsx` and related components for UI changes

3. **UI Modifications**:
   * Most UI components are in `client/src/components/ui/`
   * Game screens are in the top-level `components/` directory
   * Styles use Tailwind CSS with the `cn()` utility for conditional classes

4. **Server Communication**:
   * WebSocket message handlers are in `server/routes.ts`
   * Client-side WebSocket handling is in `client/src/lib/websocket.ts`
   * Add new message types to `WebSocketMessageType` in `schema.ts` 