import { Button } from "@/components/ui/button";

interface GameScore {
  name: string;
  score: number;
}

interface GameEndModalProps {
  winnerName: string;
  scores: GameScore[];
  onNewGame: () => void;
  onBackToLobby: () => void;
}

const GameEndModal: React.FC<GameEndModalProps> = ({
  winnerName,
  scores,
  onNewGame,
  onBackToLobby
}) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-lg shadow-lg p-6 max-w-md w-full mx-auto">
        <div className="text-center mb-6">
          <span className="inline-block p-3 bg-primary/10 text-primary rounded-full mb-2">
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              className="h-8 w-8" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" 
              />
            </svg>
          </span>
          <h3 className="text-xl font-medium mb-2">Game Over!</h3>
          <p className="text-muted-foreground">
            Point limit reached
          </p>
        </div>
        
        <div className="bg-muted p-4 rounded-lg mb-6">
          <h4 className="font-medium mb-2">Final Scores:</h4>
          <ul className="space-y-2">
            {scores.map((score, index) => (
              <li key={index} className="flex justify-between">
                <span>{score.name}:</span>
                <span className={index === 0 ? "text-success font-medium" : ""}>
                  {score.score} points{index === 0 ? " (Winner!)" : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
        
        <div className="flex flex-col md:flex-row gap-3">
          <Button
            className="flex-1"
            onClick={onNewGame}
          >
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              className="h-5 w-5 mr-2" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" 
              />
            </svg>
            New Game
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={onBackToLobby}
          >
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              className="h-5 w-5 mr-2" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" 
              />
            </svg>
            Back to Lobby
          </Button>
        </div>
      </div>
    </div>
  );
};

export default GameEndModal;
