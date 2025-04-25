import { useState, useRef, useCallback } from 'react';

// Helper to detect iOS
const isIOS = () => {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || 
         (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
};

// Check if a specific MIME type is supported
const isMimeTypeSupported = (mimeType: string): boolean => {
  if (!window.MediaRecorder) {
    return false;
  }
  
  try {
    return MediaRecorder.isTypeSupported(mimeType);
  } catch (e) {
    return false;
  }
};

// Get the best supported MIME type
const getBestSupportedMimeType = (): string => {
  // Define preferred MIME types in order of preference
  const preferredTypes = isIOS() 
    ? ['audio/mp4', 'audio/aac', 'audio/wav', 'audio/webm'] 
    : ['audio/webm', 'audio/ogg', 'audio/wav', 'audio/mp4'];
  
  // Find the first supported type
  for (const type of preferredTypes) {
    if (isMimeTypeSupported(type)) {
      console.log(`Using supported audio format: ${type}`);
      return type;
    }
  }
  
  // Default fallback
  console.warn('No preferred audio format supported, using default');
  return ''; // Let the browser choose
};

interface AudioRecorderState {
  isRecording: boolean;
  isPaused: boolean;
  duration: number;
  audioBlob: Blob | null;
  error: string | null;
  audioFormat: string;
}

interface AudioRecorderControls {
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  pauseRecording: () => void;
  resumeRecording: () => void;
  clearRecording: () => void;
}

export function useAudioRecorder(): AudioRecorderState & AudioRecorderControls {
  // Determine the best audio format based on browser support
  const audioFormat = getBestSupportedMimeType();
  
  const [state, setState] = useState<AudioRecorderState>({
    isRecording: false,
    isPaused: false,
    duration: 0,
    audioBlob: null,
    error: null,
    audioFormat
  });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const clearRecordingData = useCallback(() => {
    // Clear audio chunks
    audioChunksRef.current = [];
    
    // Stop duration timer if it's running
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
    
    // Stop and release media stream if it exists
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    // Clear recorder
    mediaRecorderRef.current = null;
  }, []);

  const startRecording = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, error: null }));

      // Request microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Set up MediaRecorder with best format
      let mediaRecorder;
      try {
        // Try with the detected format first
        if (audioFormat) {
          mediaRecorder = new MediaRecorder(stream, { mimeType: audioFormat });
        } else {
          // Let browser choose format if none supported
          mediaRecorder = new MediaRecorder(stream);
        }
      } catch (e) {
        console.warn("MediaRecorder initialization failed, using default:", e);
        mediaRecorder = new MediaRecorder(stream);
      }
      
      mediaRecorderRef.current = mediaRecorder;
      
      // Set up data handler
      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      // Handle recording stop
      mediaRecorder.onstop = () => {
        // Use the actual format from the recorder if possible
        const actualFormat = mediaRecorderRef.current?.mimeType || 'audio/webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: actualFormat });
        
        setState(prev => ({ 
          ...prev, 
          isRecording: false, 
          isPaused: false,
          audioBlob,
          audioFormat: actualFormat
        }));
      };

      // Start recording
      mediaRecorder.start(100); // Collect data every 100ms
      startTimeRef.current = Date.now();
      
      // Start duration timer
      durationIntervalRef.current = setInterval(() => {
        const currentDuration = (Date.now() - startTimeRef.current) / 1000;
        setState(prev => ({ ...prev, duration: currentDuration }));
      }, 100);

      setState(prev => ({ ...prev, isRecording: true, audioBlob: null }));
    } catch (error) {
      console.error('Error starting recording:', error);
      setState(prev => ({ 
        ...prev, 
        error: error instanceof Error ? error.message : 'Failed to start recording'
      }));
      clearRecordingData();
    }
  }, [clearRecordingData, audioFormat]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && state.isRecording) {
      mediaRecorderRef.current.stop();
      
      // Stop duration timer
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }
      
      // Stop and release media stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
    }
  }, [state.isRecording]);

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current && state.isRecording && !state.isPaused) {
      mediaRecorderRef.current.pause();
      
      // Pause duration timer
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }
      
      setState(prev => ({ ...prev, isPaused: true }));
    }
  }, [state.isRecording, state.isPaused]);

  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current && state.isRecording && state.isPaused) {
      mediaRecorderRef.current.resume();
      
      // Resume duration timer
      if (!durationIntervalRef.current) {
        durationIntervalRef.current = setInterval(() => {
          const currentDuration = (Date.now() - startTimeRef.current) / 1000;
          setState(prev => ({ ...prev, duration: currentDuration }));
        }, 100);
      }
      
      setState(prev => ({ ...prev, isPaused: false }));
    }
  }, [state.isRecording, state.isPaused]);

  const clearRecording = useCallback(() => {
    clearRecordingData();
    setState({
      isRecording: false,
      isPaused: false,
      duration: 0,
      audioBlob: null,
      error: null,
      audioFormat
    });
  }, [clearRecordingData]);

  return {
    ...state,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    clearRecording,
  };
} 