// Web Speech API + MediaRecorder wrapper for voice comment input
const VoiceInput = (() => {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const isSupported = !!SpeechRecognition;

  const LANG_MAP = { cs: 'cs-CZ', en: 'en-US', de: 'de-DE', tr: 'tr-TR' };

  let recognition = null;
  let mediaRecorder = null;
  let audioChunks = [];
  let audioBlob = null;
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
      if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
      if (onEnd) onEnd(finalTranscript.trim());
    };

    recognition.onerror = (event) => {
      isRecording = false;
      if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
      if (onError) onError(event.error);
    };
  }

  async function start(language) {
    if (!recognition) return;
    finalTranscript = '';
    audioChunks = [];
    audioBlob = null;

    // Start MediaRecorder for audio capture (parallel to SpeechRecognition)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/ogg') ? 'audio/ogg' : 'audio/mp4';
      mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunks.push(e.data); };
      mediaRecorder.onstop = () => {
        audioBlob = new Blob(audioChunks, { type: mimeType });
        stream.getTracks().forEach((t) => t.stop());
      };
      mediaRecorder.start();
    } catch {
      // microphone unavailable — continue with transcript only
    }

    recognition.lang = LANG_MAP[language] || 'en-US';
    recognition.start();
    isRecording = true;
  }

  function stop() {
    if (!recognition) return;
    recognition.stop();
  }

  function getAudioBlob() { return audioBlob; }
  function getAudioExt() {
    if (!audioBlob) return 'webm';
    if (audioBlob.type.includes('ogg')) return 'ogg';
    if (audioBlob.type.includes('mp4')) return 'mp4';
    return 'webm';
  }

  return { isSupported, init, start, stop, isRecording: () => isRecording, getAudioBlob, getAudioExt };
})();
