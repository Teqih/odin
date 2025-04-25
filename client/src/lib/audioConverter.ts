/**
 * Audio conversion utilities for client-side processing
 */

/**
 * Convert a WebM audio blob to MP3 using the Media Recorder API in the browser
 * This can only work if the source is from the same domain due to CORS restrictions
 */
export async function convertWebmToMp3Locally(webmBlob: Blob): Promise<string | null> {
  try {
    // Create an audio element to play the WebM audio
    const audio = new Audio();
    audio.src = URL.createObjectURL(webmBlob);
    
    // Create an audio context
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const source = audioContext.createMediaElementSource(audio);
    
    // Create a destination to record the output
    const destination = audioContext.createMediaStreamDestination();
    source.connect(destination);
    source.connect(audioContext.destination);
    
    // Set up the media recorder with MP3 format
    const recorder = new MediaRecorder(destination.stream, {
      mimeType: 'audio/mp3'
    });
    
    // Start recording and playing
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunks.push(e.data);
      }
    };
    
    // Create a promise to wait for completion
    return new Promise((resolve, reject) => {
      recorder.onstop = () => {
        const mp3Blob = new Blob(chunks, { type: 'audio/mp3' });
        const mp3Url = URL.createObjectURL(mp3Blob);
        resolve(mp3Url);
      };
      
      recorder.onerror = (e) => {
        reject(e);
      };
      
      // Play the audio and record it
      recorder.start();
      audio.play().catch(err => {
        recorder.stop();
        reject(err);
      });
      
      // Listen for end of playback
      audio.onended = () => {
        recorder.stop();
        audioContext.close();
      };
    });
  } catch (error) {
    console.error('Local conversion error:', error);
    return null;
  }
}

/**
 * Create a data URL from blob for direct playback
 */
export async function createDataUrl(blob: Blob): Promise<string | null> {
  try {
    const cacheKey = `audio-dataurl-${blob.size}-${Date.now().toString(36)}`;
    
    // Check if we have a cached version
    const cachedUrl = localStorage.getItem(cacheKey);
    if (cachedUrl) {
      try {
        return cachedUrl;
      } catch (e) {
        localStorage.removeItem(cacheKey);
      }
    }
    
    // Create data URL from the blob
    const reader = new FileReader();
    const dataUrlPromise = new Promise<string>((resolve) => {
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
    
    const dataUrl = await dataUrlPromise;
    
    // Cache the data URL
    try {
      localStorage.setItem(cacheKey, dataUrl);
    } catch (e) {
      console.warn('Could not cache data URL:', e);
    }
    
    return dataUrl;
  } catch (error) {
    console.error('Data URL creation error:', error);
    return null;
  }
}

/**
 * Convert WebM to a format compatible with iOS
 */
export async function convertWebmToCompatibleFormat(webmBlob: Blob): Promise<string | null> {
  try {
    // First try local conversion if supported
    try {
      const localResult = await convertWebmToMp3Locally(webmBlob);
      if (localResult) return localResult;
    } catch (e) {
      console.warn('Local conversion failed, trying data URL fallback');
    }
    
    // Fall back to data URL
    return await createDataUrl(webmBlob);
  } catch (e) {
    console.error('All conversion methods failed:', e);
    return null;
  }
} 