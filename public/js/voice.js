// Web Speech API wrapper for voice comment input
const VoiceInput = (() => {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const isSupported = !!SpeechRecognition;

  const LANG_MAP = { cs: 'cs-CZ', en: 'en-US', de: 'de-DE', tr: 'tr-TR' };

  let recognition = null;
  let isRecording = false;
  let finalTranscript = '';

  function init({ onResult, onEnd, onError }) {
    if (!isSupported) return;

    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript + ' ';
        } else {
          interim += transcript;
        }
      }
      if (onResult) onResult(finalTranscript, interim);
    };

    recognition.onend = () => {
      isRecording = false;
      if (onEnd) onEnd(finalTranscript.trim());
    };

    recognition.onerror = (event) => {
      isRecording = false;
      if (onError) onError(event.error);
    };
  }

  function start(language) {
    if (!recognition) return;
    finalTranscript = '';
    recognition.lang = LANG_MAP[language] || 'en-US';
    recognition.start();
    isRecording = true;
  }

  function stop() {
    if (!recognition) return;
    recognition.stop();
  }

  return { isSupported, init, start, stop, isRecording: () => isRecording };
})();
