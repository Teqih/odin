# Project Architecture Overview

This document outlines the architecture of the OdinCardClash project.

## Structure

The project follows a monorepo structure with three main directories:

1.  **`client/`**: Contains the frontend React application.
2.  **`server/`**: Contains the backend Node.js/Express application.
3.  **`shared/`**: Contains code shared between the client and server, primarily TypeScript types and schemas.

## Server (`server/`)

The server is built using Node.js and Express. It handles game logic, manages game state, and communicates with clients via HTTP API endpoints and WebSockets.

*   **`index.ts`**: The main entry point for the server. Sets up the Express app, WebSocket server, and integrates routes.
*   **`routes.ts`**: Defines the HTTP API routes for actions like creating games, joining games, playing cards, passing turns, etc. It uses Zod for request validation.
*   **`game.ts`**: Contains the core game logic, including functions for creating and shuffling decks, dealing cards, validating plays (`isValidPlay`), calculating scores (`calculateRoundScores`), and managing rounds (`startNewRound`).
*   **`storage.ts`**: Manages the persistence of game state. The current implementation (`MemStorage`) stores game data in memory. It provides methods for creating, retrieving, and updating game and player data.
*   **`vite.ts`**: Handles integration with Vite, likely for serving the client application in development or managing server-side rendering aspects if applicable.

## Client (`client/`)

The client is a single-page application built with React and Vite. It interacts with the server API to send player actions and receives real-time game state updates via WebSockets.

*   **`index.html`**: The main HTML entry point.
*   **`src/main.tsx`**: The entry point for the React application, rendering the root `App` component.
*   **`src/App.tsx`**: The root React component, likely responsible for setting up routing (using `react-router-dom`) and global providers (like React Query).
*   **`src/components/`**: Contains reusable UI components (e.g., `Card`, `PlayerHand`, `GameBoard`, modals).
*   **`src/pages/`**: Contains top-level components for different application views (e.g., `HomeScreen`, `GameScreen`, `JoinScreen`).
*   **`src/hooks/`**: Custom React hooks for managing component logic, interacting with the server (likely using `tanstack/react-query`), and handling WebSocket events.
*   **`src/lib/`**: Utility functions, API client setup, and WebSocket connection management.
*   **`src/styles/`**: CSS files or configuration for styling (likely Tailwind CSS based on root config files).

## Shared (`shared/`)

This directory contains code intended to be used by both the client and server.

*   **`schema.ts`**: Defines shared TypeScript interfaces and Zod schemas for data structures like `GameState`, `Player`, `Card`, API request/response types, etc. This ensures type safety and consistency across the client-server boundary.

## Technology Stack

*   **Frontend**: React, Vite, TypeScript, Tailwind CSS, `tanstack/react-query`, `socket.io-client`, `react-router-dom`
*   **Backend**: Node.js, Express, TypeScript, `socket.io`, Zod
*   **Shared**: TypeScript, Zod
*   **Build/Tooling**: Vite, npm

## Communication Flow

1.  Client connects to the server via HTTP and WebSocket.
2.  Player actions (join game, play card, etc.) are sent via HTTP POST requests to the API endpoints defined in `server/routes.ts`.
3.  The server validates the request, updates the game state using `server/storage.ts` and `server/game.ts`.
4.  The server broadcasts the updated `GameState` to all connected clients in the relevant game room via WebSockets.
5.  The client receives the WebSocket message and updates the UI accordingly. 