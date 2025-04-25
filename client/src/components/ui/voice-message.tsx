import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { PlayCircle, PauseCircle, XCircle, RefreshCw, Download, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import axios from "axios";
import { convertWebmToCompatibleFormat } from "@/lib/audioConverter";

// Helper to detect iOS
const isIOS = () => {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || 
         (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
};

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
  const [isIosDevice] = useState(() => isIOS());
  const [isAudioSupported, setIsAudioSupported] = useState(true);
  const [isConverting, setIsConverting] = useState(false);
  const [convertedUrl, setConvertedUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef<boolean>(true);

  // Function to load audio file and convert if needed
  const setupAudioWithFormat = async (url: string) => {
    if (!mountedRef.current) return;
    
    try {
      // Clean up existing audio
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
      
      // Create audio element
      const audio = document.createElement('audio');
      
      // Check if the audio is likely a WebM format (from Android) on iOS
      const isWebmAudio = url.includes('.webm') || url.includes('/voice-messages/');
      
      if (isIosDevice && isWebmAudio && !convertedUrl) {
        // Handle WebM on iOS - we need to fetch and check the headers
        try {
          const response = await axios.head(url);
          const needsConversion = response.headers['x-requires-conversion'] === 'true' || 
                                  response.headers['x-audio-format'] === 'webm';
          
          if (needsConversion) {
            setIsAudioSupported(false);
            setError('This audio format requires conversion for your device');
            return;
          }
        } catch (err) {
          console.error('Error checking audio format:', err);
        }
      }
      
      // Set up error handler
      const handleError = (e: Event) => {
        console.error('Audio error:', e, audio.error);
        if (mountedRef.current) {
          setIsPlaying(false);
          
          // Format-specific error handling
          if (audio.error && (audio.error.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED || 
              audio.error.code === MediaError.MEDIA_ERR_DECODE)) {
            if (isIosDevice && isWebmAudio) {
              setError('This audio format requires conversion for your device');
              setIsAudioSupported(false);
              return;
            }
          }
          
          setError('Error loading audio. Try again.');
        }
      };
      
      audio.addEventListener('error', handleError);
      
      // Add playback event listeners
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
      
      // Setup for better mobile compatibility
      audio.preload = 'metadata';
      audio.crossOrigin = 'anonymous';
      
      // Store reference
      audioRef.current = audio;
      
      // Use converted URL if available
      const audioSource = convertedUrl || `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`;
      
      // Listen for metadata loading
      audio.addEventListener('loadedmetadata', () => {
        if (mountedRef.current) {
          console.log('Audio loaded successfully');
          setError(null);
          setIsAudioSupported(true);
        }
      });
      
      // For iOS canplay event
      if (isIosDevice) {
        audio.addEventListener('canplay', () => {
          if (mountedRef.current) {
            console.log('iOS: Audio can play');
            setIsAudioSupported(true);
          }
        });
      }
      
      // Set source and load
      audio.src = audioSource;
      audio.load();
      
    } catch (err) {
      console.error('Error creating audio element:', err);
      if (mountedRef.current) {
        setError('Browser audio error');
      }
    }
  };

  // Convert WebM to compatible format using client-side utilities
  const convertAudio = async () => {
    if (!mountedRef.current) return;
    
    setIsConverting(true);
    setError(null);
    
    try {
      // Fetch the audio file
      const response = await fetch(audioUrl);
      const audioBlob = await response.blob();
      
      // Try to convert the blob using our utility
      const convertedBlobUrl = await convertWebmToCompatibleFormat(audioBlob);
      
      if (convertedBlobUrl) {
        setConvertedUrl(convertedBlobUrl);
        setIsAudioSupported(true);
        setupAudioWithFormat(convertedBlobUrl);
      } else {
        throw new Error("Unable to convert audio to a compatible format");
      }
    } catch (error) {
      console.error('Conversion error:', error);
      setError('Could not convert audio. Please download instead.');
    } finally {
      setIsConverting(false);
    }
  };

  // Setup audio on mount and when URL changes
  useEffect(() => {
    // Set mounted flag
    mountedRef.current = true;
    
    // Reset state for new audio URL
    if (convertedUrl === null) {
      setupAudioWithFormat(audioUrl);
    }
    
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
          audio.removeEventListener('canplay', () => {});
          
          // Clear source
          audio.src = '';
          audio.removeAttribute('src');
          audio.load();
        } catch (e) {
          console.warn('Error during audio cleanup:', e);
        }
        
        // Clear reference
        audioRef.current = null;
      }
      
      // Clear any converted URLs
      if (convertedUrl) {
        URL.revokeObjectURL(convertedUrl);
      }
    };
  }, [audioUrl, retryCount, isIosDevice, convertedUrl]);

  // Handle direct download
  const handleDownload = () => {
    if (audioUrl) {
      // Create a temporary link element
      const a = document.createElement('a');
      a.href = audioUrl;
      a.download = `voice-message-${new Date(timestamp).toISOString()}.audio`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  // Toggle play/pause
  const togglePlayback = () => {
    if (!audioRef.current) {
      setError('Audio player not available');
      return;
    }
    
    if (isPlaying) {
      try {
        audioRef.current.pause();
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
        const playPromise = audioRef.current.play();
        
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              if (!mountedRef.current) return;
              
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
                    console.error('Error updating progress:', e);
                  }
                }
              }, 100);
            })
            .catch(error => {
              if (!mountedRef.current) return;
              console.error('Error playing audio:', error);
              
              // Check for format-specific errors
              if (isIosDevice && (audioUrl.includes('.webm') || !audioUrl.includes('.m4a'))) {
                setError('This audio format is not supported on your device');
                setIsAudioSupported(false);
              } else {
                setError('Cannot play audio. Try again.');
              }
            });
        }
      } catch (e) {
        console.error('Error initiating audio playback:', e);
        setError('Browser cannot play this audio format');
        setIsAudioSupported(false);
      }
    }
  };
  
  // Retry loading the audio
  const handleRetry = () => {
    setRetryCount(prev => prev + 1);
    setProgress(0);
    setError(null);
    setIsAudioSupported(true);
    setConvertedUrl(null);
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
          
          {!isAudioSupported && isIosDevice ? (
            <div className="flex flex-col gap-2 mt-1 w-full">
              <Button 
                variant="outline" 
                size="sm"
                onClick={convertAudio}
                disabled={isConverting}
                className="flex items-center gap-1"
              >
                {isConverting ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Converting...</span>
                  </>
                ) : (
                  <>
                    <Upload size={14} />
                    <span>Play in Compatible Format</span>
                  </>
                )}
              </Button>
              
              <Button 
                variant="ghost" 
                size="sm"
                onClick={handleDownload}
                className="flex items-center gap-1"
              >
                <Download size={14} />
                <span>Download Audio</span>
              </Button>
            </div>
          ) : (
            <Button 
              variant="ghost" 
              size="sm"
              onClick={handleRetry}
              className="mt-1 flex items-center gap-1"
            >
              <RefreshCw size={14} />
              <span>Retry</span>
            </Button>
          )}
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