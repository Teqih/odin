import { useState } from "react";
import { useRoute } from "wouter";
import HomeScreen from "@/components/home-screen";
import CreateGameScreen from "@/components/create-game-screen";
import JoinGameScreen from "@/components/join-game-screen";

const Home: React.FC = () => {
  const [match, params] = useRoute("/:screen");
  const screen = params?.screen || "";
  
  if (screen === "create") {
    return <CreateGameScreen />;
  }
  
  if (screen === "join") {
    return <JoinGameScreen />;
  }
  
  return <HomeScreen />;
};

export default Home;
