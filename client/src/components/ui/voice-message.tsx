import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { PlayCircle, PauseCircle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface VoiceMessageProps {
  audioUrl: string;
  duration: number;
  isCurrentUser: boolean;
  timestamp: number;
}

export const VoiceMessage: React.FC<VoiceMessageProps> = ({ 
  audioUrl, 
  duration, 
  isCurrentUser,
  timestamp
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Set up audio element
  useEffect(() => {
    const audio = new Audio(audioUrl);
    audioRef.current = audio;

    // Set up event handlers
    audio.addEventListener('play', () => setIsPlaying(true));
    audio.addEventListener('pause', () => setIsPlaying(false));
    audio.addEventListener('ended', () => {
      setIsPlaying(false);
      setProgress(0);
    });
    audio.addEventListener('error', () => {
      setError('Error loading audio');
      setIsPlaying(false);
    });

    return () => {
      // Clean up event listeners
      audio.pause();
      audio.removeEventListener('play', () => setIsPlaying(true));
      audio.removeEventListener('pause', () => setIsPlaying(false));
      audio.removeEventListener('ended', () => {
        setIsPlaying(false);
        setProgress(0);
      });
      audio.removeEventListener('error', () => {
        setError('Error loading audio');
        setIsPlaying(false);
      });
      
      // Clear update interval
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [audioUrl]);

  // Toggle play/pause
  const togglePlayback = () => {
    if (!audioRef.current) return;
    
    if (isPlaying) {
      audioRef.current.pause();
      // Clear progress update interval
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    } else {
      audioRef.current.play().catch(error => {
        console.error('Error playing audio:', error);
        setError('Failed to play audio');
      });
      
      // Set up progress update interval
      intervalRef.current = setInterval(() => {
        if (audioRef.current) {
          const currentProgress = (audioRef.current.currentTime / audioRef.current.duration) * 100;
          setProgress(currentProgress);
        }
      }, 100);
    }
  };

  // Format duration display (MM:SS)
  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
  };

  return (
    <div className={cn(
      "flex flex-col",
      "rounded-lg p-3",
      isCurrentUser 
        ? "bg-primary text-primary-foreground" 
        : "bg-secondary text-secondary-foreground"
    )}>
      {error ? (
        <div className="text-red-500 flex items-center gap-2">
          <XCircle size={16} />
          <span>{error}</span>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <Button 
              variant={isCurrentUser ? "secondary" : "default"}
              size="icon"
              className="h-8 w-8"
              onClick={togglePlayback}
            >
              {isPlaying ? (
                <PauseCircle size={20} />
              ) : (
                <PlayCircle size={20} />
              )}
            </Button>
            
            <div className="flex-1">
              <div className="w-full bg-background/20 rounded-full h-1.5">
                <div 
                  className="bg-background/60 h-1.5 rounded-full" 
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
            </div>
            
            <span className="text-xs whitespace-nowrap">
              {formatDuration(duration)}
            </span>
          </div>
          
          <div className="text-xs opacity-70 text-right mt-1">
            {new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        </>
      )}
    </div>
  );
}; 