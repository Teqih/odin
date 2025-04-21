import { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, MessageCircle, X } from "lucide-react";
import { sendMessage, addMessageHandler, addTypedMessageHandler } from "@/lib/websocket";
import { ChatMessage, WebSocketMessage } from "@shared/schema";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface ChatPanelProps {
  gameId: string;
  playerId: string;
  playerName: string;
  open?: boolean;
  onClose?: () => void;
}

const ChatPanel: React.FC<ChatPanelProps> = ({ 
  gameId, 
  playerId, 
  playerName,
  open = false,
  onClose
}) => {
  const [isOpen, setIsOpen] = useState(open);
  const [message, setMessage] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const lastViewedRef = useRef<number>(Date.now());

  // Handle messages from WebSocket
  useEffect(() => {
    // Message handler for chat messages
    const handleChatMessage = (message: WebSocketMessage) => {
      if (message.type === "chat_message" && message.chatMessage) {
        setChatMessages(prev => [...prev, message.chatMessage!]);
        
        // If the chat is closed and message is from someone else, increment unread count
        if (!isOpen && message.chatMessage.playerId !== playerId) {
          setUnreadCount(prev => prev + 1);
        }
      } else if (message.type === "chat_history" && message.chatHistory) {
        setChatMessages(message.chatHistory);
        
        // Calculate unread messages based on last viewed timestamp
        if (!isOpen) {
          const unreadMessages = message.chatHistory.filter(
            msg => msg.timestamp > lastViewedRef.current && msg.playerId !== playerId
          );
          setUnreadCount(unreadMessages.length);
        }
      }
    };

    // Add the chat message handler
    addMessageHandler(handleChatMessage);

    // Request chat history on mount
    sendMessage({
      type: "chat_history",
      gameId,
      playerId
    });

    return () => {
      // No cleanup needed as the handler will be cleared when the component unmounts
    };
  }, [gameId, playerId, isOpen]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (chatContainerRef.current && isOpen) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatMessages, isOpen]);

  // Handle opening/closing the chat
  useEffect(() => {
    setIsOpen(open);
    
    // When opening chat, clear unread count and update last viewed time
    if (open) {
      setUnreadCount(0);
      lastViewedRef.current = Date.now();
    }
  }, [open]);

  const handleClose = () => {
    setIsOpen(false);
    // Set last viewed time when closing
    lastViewedRef.current = Date.now();
    if (onClose) onClose();
  };

  const handleSendMessage = () => {
    if (!message.trim()) return;

    // Send the message via WebSocket
    sendMessage({
      type: "chat_message",
      gameId,
      playerId,
      chatMessage: {
        id: "temp-" + Date.now(), // Server will replace this
        gameId,
        playerId,
        playerName,
        message: message.trim(),
        timestamp: Date.now()
      }
    });

    setMessage("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Render minimized chat button if not open
  if (!isOpen) {
    return (
      <Button 
        className="fixed bottom-4 right-4 rounded-full p-3 h-12 w-12 shadow-lg z-50 relative"
        onClick={() => {
          setIsOpen(true);
          setUnreadCount(0);
          lastViewedRef.current = Date.now();
        }}
        variant="default"
      >
        <MessageCircle size={24} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full h-5 min-w-5 flex items-center justify-center text-xs font-medium">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </Button>
    );
  }

  return (
    <Card className={cn(
      "fixed z-50 flex flex-col",
      "bottom-0 right-0 h-[75vh] w-full",
      "landscape:h-full landscape:w-[300px]",
      "sm:right-4 sm:bottom-4 sm:h-[50vh] sm:w-96 sm:rounded-lg",
      "shadow-lg overflow-hidden"
    )}>
      {/* Chat header */}
      <div className="flex items-center justify-between p-3 border-b">
        <h3 className="font-semibold">Game Chat</h3>
        <Button 
          variant="ghost" 
          size="sm" 
          className="p-1 h-8 w-8"
          onClick={handleClose}
        >
          <X size={18} />
        </Button>
      </div>

      {/* Chat messages */}
      <div 
        className="flex-1 flex flex-col gap-2 p-3 overflow-y-auto"
        ref={chatContainerRef}
      >
        {chatMessages.length === 0 ? (
          <div className="text-center text-muted-foreground text-sm py-4">
            No messages yet. Start the conversation!
          </div>
        ) : (
          chatMessages.map(msg => (
            <div 
              key={msg.id}
              className={cn(
                "max-w-[85%] rounded-lg p-2.5",
                msg.playerId === playerId 
                  ? "bg-primary text-primary-foreground ml-auto" 
                  : "bg-secondary text-secondary-foreground"
              )}
            >
              {msg.playerId !== playerId && (
                <div className="font-semibold text-xs mb-1">{msg.playerName}</div>
              )}
              <div>{msg.message}</div>
              <div className="text-xs opacity-70 text-right mt-1">
                {format(new Date(msg.timestamp), 'HH:mm')}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Chat input */}
      <div className="p-3 border-t flex gap-2">
        <Input
          placeholder="Type a message..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1"
        />
        <Button 
          onClick={handleSendMessage}
          disabled={!message.trim()}
          size="icon"
        >
          <Send size={18} />
        </Button>
      </div>
    </Card>
  );
};

export default ChatPanel; 