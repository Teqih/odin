import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Add custom styles for the game
import './styles/card-styles.css';

createRoot(document.getElementById("root")!).render(<App />);
