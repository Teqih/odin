import { useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import GameScreen from "@/components/game-screen";
import LobbyScreen from "@/components/lobby-screen";

const Game: React.FC = () => {
  const [gameMatch, gameParams] = useRoute("/game/:gameId");
  const [lobbyMatch, lobbyParams] = useRoute("/lobby/:gameId");
  const [, navigate] = useLocation();
  
  const gameId = gameMatch ? gameParams?.gameId : lobbyMatch ? lobbyParams?.gameId : "";
  
  useEffect(() => {
    if (!gameId) {
      navigate("/");
    }
  }, [gameId, navigate]);
  
  if (!gameId) {
    return null;
  }
  
  if (lobbyMatch) {
    return <LobbyScreen />;
  }
  
  return <GameScreen gameId={gameId} />;
};

export default Game;
