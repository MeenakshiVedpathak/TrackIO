import { useEffect, useRef, useState } from 'react';

const getRecognitionCtor = () =>
  (typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)) || null;

// Thin wrapper over the browser's Web Speech API (Feature 11 — Voice Search). Purely a
// progressive enhancement: `supported` is false in browsers without it, so callers can
// just hide the mic button rather than show a broken one.
export const useSpeechRecognition = ({ onResult } = {}) => {
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef(null);
  const supported = !!getRecognitionCtor();

  const stop = () => {
    recognitionRef.current?.stop();
  };

  const start = () => {
    if (!supported || listening) return;
    const Ctor = getRecognitionCtor();
    const recognition = new Ctor();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript ?? '';
      if (transcript) onResult?.(transcript);
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  };

  useEffect(() => () => recognitionRef.current?.stop(), []);

  return { supported, listening, start, stop };
};

export default useSpeechRecognition;
