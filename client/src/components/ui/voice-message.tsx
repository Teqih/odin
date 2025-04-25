import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { PlayCircle, PauseCircle, XCircle, RefreshCw } from "lucide-react";
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
  const [retryCount, setRetryCount] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef<boolean>(true);

  // Set up audio element
  useEffect(() => {
    // Set mounted flag
    mountedRef.current = true;
    
    const createAudio = () => {
      if (!mountedRef.current) return;
      
      try {
        // Clean up existing audio if present
        if (audioRef.current) {
          try {
            audioRef.current.pause();
            audioRef.current.removeAttribute('src');
            audioRef.current.load();
          } catch (e) {
            console.warn('Error cleaning up previous audio:', e);
          }
          audioRef.current = null;
        }
        
        // Create new audio element - using HTMLAudioElement directly
        const audio = document.createElement('audio');
        
        // Set up error handler before setting src to catch all errors
        const handleError = (e: Event) => {
          console.error('Audio error:', e);
          if (mountedRef.current) {
            setIsPlaying(false);
            setError('Error loading audio. Try again.');
          }
        };
        
        audio.addEventListener('error', handleError);
        
        // Add event listeners for playback state using function references
        // to make sure we can remove them properly later
        const handlePlay = () => {
          if (mountedRef.current) setIsPlaying(true);
        };
        
        const handlePause = () => {
          if (mountedRef.current) setIsPlaying(false);
        };
        
        const handleEnded = () => {
          if (mountedRef.current) {
            setIsPlaying(false);
            setProgress(0);
          }
        };
        
        audio.addEventListener('play', handlePlay);
        audio.addEventListener('pause', handlePause);
        audio.addEventListener('ended', handleEnded);
        
        // Store listeners for cleanup
        audio.dataset.handlePlay = 'true';
        audio.dataset.handlePause = 'true';
        audio.dataset.handleEnded = 'true';
        audio.dataset.handleError = 'true';
        
        // Setup audio for better mobile compatibility
        audio.preload = 'metadata';
        
        // Set crossOrigin to fix potential CORS issues
        audio.crossOrigin = 'anonymous';
        
        // Store reference before setting src
        audioRef.current = audio;
        
        // Add cache busting to prevent browser caching issues
        const cacheBuster = `${audioUrl}${audioUrl.includes('?') ? '&' : '?'}t=${Date.now()}`;
        
        // Listen for loadedmetadata to know when audio is ready
        audio.addEventListener('loadedmetadata', () => {
          if (mountedRef.current) {
            console.log('Audio loaded successfully');
            setError(null);
          }
        });
        
        // Set source and try to load
        audio.src = cacheBuster;
        
        // Manually trigger loading
        audio.load();
        // No need to handle load promise - audio.load() doesn't return a promise
        // Just catch any loading errors through the error event listener
      } catch (err) {
        console.error('Error creating audio element:', err);
        if (mountedRef.current) {
          setError('Browser audio error');
        }
      }
    };
    
    // Create initial audio
    createAudio();
    
    // Cleanup function
    return () => {
      mountedRef.current = false;
      
      // Clear progress update interval
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      
      // Clean up audio element
      if (audioRef.current) {
        const audio = audioRef.current;
        
        try {
          // Stop playback
          audio.pause();
          
          // Remove event listeners
          audio.removeEventListener('play', () => {});
          audio.removeEventListener('pause', () => {});
          audio.removeEventListener('ended', () => {});
          audio.removeEventListener('error', () => {});
          audio.removeEventListener('loadedmetadata', () => {});
          
          // Clear source and release resources
          audio.src = '';
          audio.removeAttribute('src');
          audio.load();
        } catch (e) {
          // Ignore errors during cleanup
          console.warn('Error during audio cleanup:', e);
        }
        
        // Clear reference
        audioRef.current = null;
      }
    };
  }, [audioUrl, retryCount]);

  // Toggle play/pause
  const togglePlayback = () => {
    if (!audioRef.current) {
      setError('Audio player not available');
      return;
    }
    
    if (isPlaying) {
      try {
        audioRef.current.pause();
        // Clear progress update interval
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      } catch (e) {
        console.error('Error pausing audio:', e);
        setError('Error controlling playback');
      }
    } else {
      try {
        // Try to play, with error handling
        const playPromise = audioRef.current.play();
        
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              // Playback started successfully
              if (!mountedRef.current) return;
              
              // Set up progress update interval
              if (intervalRef.current) {
                clearInterval(intervalRef.current);
              }
              
              intervalRef.current = setInterval(() => {
                if (!mountedRef.current) {
                  if (intervalRef.current) {
                    clearInterval(intervalRef.current);
                    intervalRef.current = null;
                  }
                  return;
                }
                
                if (audioRef.current) {
                  try {
                    const currentProgress = (audioRef.current.currentTime / audioRef.current.duration) * 100;
                    setProgress(isNaN(currentProgress) ? 0 : currentProgress);
                  } catch (e) {
                    // Handle potential errors reading current time
                    console.error('Error updating progress:', e);
                  }
                }
              }, 100);
            })
            .catch(error => {
              if (!mountedRef.current) return;
              console.error('Error playing audio:', error);
              setError('Cannot play audio. Try again.');
            });
        }
      } catch (e) {
        console.error('Error initiating audio playback:', e);
        setError('Browser cannot play this audio format');
      }
    }
  };
  
  // Retry loading the audio
  const handleRetry = () => {
    setRetryCount(prev => prev + 1);
    setProgress(0);
    setError(null);
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
        <div className="flex flex-col items-center gap-2">
          <div className="text-red-500 flex items-center gap-2">
            <XCircle size={16} />
            <span>{error}</span>
          </div>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={handleRetry}
            className="mt-1 flex items-center gap-1"
          >
            <RefreshCw size={14} />
            <span>Retry</span>
          </Button>
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