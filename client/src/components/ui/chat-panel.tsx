import { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, MessageCircle, X, Mic, StopCircle, Loader2 } from "lucide-react";
import { sendMessage, addMessageHandler, addTypedMessageHandler } from "@/lib/websocket";
import { ChatMessage, WebSocketMessage, MessageType } from "@shared/schema";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { VoiceMessage } from "@/components/ui/voice-message";
import axios from "axios";
import "@/styles/voice-recorder.css";

interface ChatPanelProps {
  gameId: string;
  playerId: string;
  playerName: string;
  open?: boolean;
  onClose?: () => void;
  onUnreadCount?: (count: number) => void;
}

const ChatPanel: React.FC<ChatPanelProps> = ({ 
  gameId, 
  playerId, 
  playerName,
  open = false,
  onClose,
  onUnreadCount
}) => {
  const [isOpen, setIsOpen] = useState(open);
  const [message, setMessage] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const lastViewedRef = useRef<number>(Date.now());
  const processedMessagesRef = useRef<Set<string>>(new Set());
  const messageHandlerRef = useRef<(() => void) | null>(null);
  
  // Audio recorder hook
  const { 
    isRecording, 
    duration, 
    audioBlob, 
    error: recorderError,
    startRecording, 
    stopRecording,
    clearRecording
  } = useAudioRecorder();

  // Handle messages from WebSocket
  useEffect(() => {
    // Clear any previous message handler
    if (messageHandlerRef.current) {
      messageHandlerRef.current();
      messageHandlerRef.current = null;
    }

    // Message handler for chat messages
    const handleChatMessage = (message: WebSocketMessage) => {
      if (message.type === "chat_message" && message.chatMessage) {
        // Check if this message ID has already been processed
        if (!processedMessagesRef.current.has(message.chatMessage.id)) {
          processedMessagesRef.current.add(message.chatMessage.id);
          setChatMessages(prev => [...prev, message.chatMessage!]);
          
          // If the chat is closed and message is from someone else, increment unread count
          if (!isOpen && message.chatMessage.playerId !== playerId) {
            const newCount = unreadCount + 1;
            setUnreadCount(newCount);
            if (onUnreadCount) {
              onUnreadCount(newCount);
            }
          }
        }
      } else if (message.type === "chat_history" && message.chatHistory) {
        // For chat history, we reset our processed set and replace all messages
        processedMessagesRef.current = new Set(message.chatHistory.map(msg => msg.id));
        setChatMessages(message.chatHistory);
        
        // Calculate unread messages based on last viewed timestamp
        if (!isOpen) {
          const unreadMessages = message.chatHistory.filter(
            msg => msg.timestamp > lastViewedRef.current && msg.playerId !== playerId
          );
          const newCount = unreadMessages.length;
          setUnreadCount(newCount);
          if (onUnreadCount) {
            onUnreadCount(newCount);
          }
        }
      }
    };

    // Add the chat message handler
    messageHandlerRef.current = addMessageHandler(handleChatMessage);

    // Request chat history on mount
    sendMessage({
      type: "chat_history",
      gameId,
      playerId
    });

    // Clean up handler on unmount or when dependencies change
    return () => {
      if (messageHandlerRef.current) {
        messageHandlerRef.current();
        messageHandlerRef.current = null;
      }
    };
  }, [gameId, playerId, isOpen, unreadCount, onUnreadCount]);

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
      if (onUnreadCount) {
        onUnreadCount(0);
      }
      lastViewedRef.current = Date.now();
    }
  }, [open, onUnreadCount]);

  // Handle voice recording errors
  useEffect(() => {
    if (recorderError) {
      // Display error to user
      console.error('Recording error:', recorderError);
    }
  }, [recorderError]);

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
        timestamp: Date.now(),
        messageType: "text"
      }
    });

    setMessage("");
  };

  const handleRecordToggle = async () => {
    if (isRecording) {
      stopRecording();
    } else {
      await startRecording();
    }
  };

  const handleSendVoiceMessage = async () => {
    if (!audioBlob) return;
    
    try {
      setIsUploading(true);
      
      // Create form data for upload
      const formData = new FormData();
      formData.append('audio', audioBlob, 'voice-message.webm');
      formData.append('playerId', playerId);
      formData.append('playerName', playerName);
      formData.append('duration', duration.toString());
      
      // Upload the voice message
      await axios.post(`/api/games/${gameId}/voice-message`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      
      // Clear recording after successful upload
      clearRecording();
    } catch (error) {
      console.error('Error uploading voice message:', error);
    } finally {
      setIsUploading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Don't render anything if chat is not open
  if (!isOpen) {
    return null;
  }

  // Render message based on type
  const renderMessage = (msg: ChatMessage) => {
    const isCurrentUser = msg.playerId === playerId;
    
    if (msg.messageType === "voice") {
      return (
        <VoiceMessage 
          audioUrl={msg.audioUrl!}
          duration={msg.duration || 0}
          isCurrentUser={isCurrentUser}
          timestamp={msg.timestamp}
        />
      );
    }
    
    // Default to text message
    return (
      <div 
        className={cn(
          "max-w-[85%] rounded-lg p-2.5",
          isCurrentUser 
            ? "bg-primary text-primary-foreground ml-auto" 
            : "bg-secondary text-secondary-foreground"
        )}
      >
        {!isCurrentUser && (
          <div className="font-semibold text-xs mb-1">{msg.playerName}</div>
        )}
        <div>{msg.message}</div>
        <div className="text-xs opacity-70 text-right mt-1">
          {format(new Date(msg.timestamp), 'HH:mm')}
        </div>
      </div>
    );
  };

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
            <div key={msg.id}>
              {renderMessage(msg)}
            </div>
          ))
        )}
      </div>

      {/* Voice recording preview */}
      {(isRecording || audioBlob) && (
        <div className="p-3 border-t flex items-center gap-2">
          {isRecording ? (
            <div className="flex items-center gap-2 text-red-500">
              <div className="voice-recorder-wave">
                <div className="bar"></div>
                <div className="bar"></div>
                <div className="bar"></div>
                <div className="bar"></div>
                <div className="bar"></div>
              </div>
              <span className="text-sm">Recording... {duration.toFixed(1)}s</span>
            </div>
          ) : (
            <div className="flex-1 text-sm">Voice message recorded ({duration.toFixed(1)}s)</div>
          )}
          
          {audioBlob && !isRecording && (
            <Button
              variant="default"
              size="sm"
              onClick={handleSendVoiceMessage}
              disabled={isUploading}
            >
              {isUploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Send"
              )}
            </Button>
          )}
          
          <Button 
            variant="outline"
            size="sm"
            onClick={isRecording ? stopRecording : clearRecording}
          >
            {isRecording ? "Stop" : "Cancel"}
          </Button>
        </div>
      )}

      {/* Chat input */}
      <div className="p-3 border-t flex gap-2">
        <Input
          placeholder="Type a message..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1"
          disabled={isRecording || !!audioBlob}
        />
        
        {/* Record button */}
        <Button 
          onClick={handleRecordToggle}
          size="icon"
          variant={isRecording ? "destructive" : "outline"}
          disabled={!!audioBlob && !isRecording}
        >
          {isRecording ? (
            <StopCircle size={18} />
          ) : (
            <Mic size={18} />
          )}
        </Button>
        
        {/* Send text message button */}
        <Button 
          onClick={handleSendMessage}
          disabled={!message.trim() || isRecording || !!audioBlob}
          size="icon"
        >
          <Send size={18} />
        </Button>
      </div>
    </Card>
  );
};

export default ChatPanel; 