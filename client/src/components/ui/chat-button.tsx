import { useState, useEffect, lazy, Suspense } from "react";
import { Button } from "@/components/ui/button";
import { MessageCircle } from "lucide-react";

// Lazy load the ChatPanel component
const ChatPanel = lazy(() => import("@/components/ui/chat-panel"));

interface ChatButtonProps {
  gameId: string;
  playerId: string;
  playerName: string;
  position?: "bottom-right" | "top-right";
}

export const ChatButton: React.FC<ChatButtonProps> = ({
  gameId,
  playerId,
  playerName,
  position = "bottom-right"
}) => {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isPanelMounted, setIsPanelMounted] = useState(false);

  // Initialize panel with slight delay to prevent immediate mount during initial load
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsPanelMounted(true);
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // Reset state when props change (e.g., navigating between games)
  useEffect(() => {
    // Reset unread count when gameId changes
    setUnreadCount(0);
    setIsChatOpen(false);
    
    // This effect cleans up automatically when component unmounts
  }, [gameId, playerId]);

  const handleUnreadCountChange = (count: number) => {
    setUnreadCount(count);
  };

  const positionClasses = position === "bottom-right" 
    ? "bottom-4 right-4" 
    : "top-4 right-4";

  return (
    <>
      <Button
        onClick={() => setIsChatOpen(true)}
        size="icon"
        className={`fixed ${positionClasses} z-40 shadow-lg hover:shadow-xl transition-all`}
        aria-label="Open chat"
      >
        <MessageCircle size={22} />
        {unreadCount > 0 && (
          <span className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground text-xs rounded-full h-5 w-5 flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </Button>

      {/* Always render the ChatPanel but control visibility with CSS */}
      {isPanelMounted && (
        <Suspense fallback={
          <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/40 ${!isChatOpen ? 'hidden' : ''}`}>
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div>
          </div>
        }>
          <ChatPanel
            gameId={gameId}
            playerId={playerId}
            playerName={playerName}
            open={isChatOpen}
            onClose={() => setIsChatOpen(false)}
            onUnreadCount={handleUnreadCountChange}
          />
        </Suspense>
      )}
    </>
  );
}; 