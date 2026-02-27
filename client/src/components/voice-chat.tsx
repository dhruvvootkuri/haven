import { useState, useRef, useCallback, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PhoneOff, Mic, Volume2, Loader2 } from "lucide-react";

interface VoiceChatProps {
  callId: string;
  clientId: string;
  greetingText?: string;
  onCallEnded?: () => void;
}

type CallPhase = "greeting" | "listening" | "processing" | "speaking" | "ended";

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

export default function VoiceChat({ callId, greetingText, onCallEnded }: VoiceChatProps) {
  const [phase, setPhase] = useState<CallPhase>("greeting");
  const [interimText, setInterimText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const isProcessingRef = useRef(false);
  const shouldListenRef = useRef(false);
  const endedRef = useRef(false);
  const elevenLabsAvailableRef = useRef<boolean | null>(null);

  const stopRecognition = useCallback(() => {
    if (recognitionRef.current) {
      shouldListenRef.current = false;
      try { recognitionRef.current.abort(); } catch (e) {}
      recognitionRef.current = null;
    }
  }, []);

  const playAudioFromServer = useCallback(async (text: string): Promise<boolean> => {
    try {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        if (data.fallback) return false;
        return false;
      }

      const arrayBuffer = await response.arrayBuffer();
      const blob = new Blob([arrayBuffer], { type: "audio/mpeg" });
      const url = URL.createObjectURL(blob);

      return new Promise((resolve) => {
        const audio = new Audio(url);
        audio.onended = () => {
          URL.revokeObjectURL(url);
          resolve(true);
        };
        audio.onerror = () => {
          URL.revokeObjectURL(url);
          resolve(false);
        };
        audio.play().catch(() => resolve(false));
      });
    } catch {
      return false;
    }
  }, []);

  const speakWithBrowserFallback = useCallback((text: string): Promise<void> => {
    return new Promise((resolve) => {
      if (!window.speechSynthesis) {
        resolve();
        return;
      }
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;

      const pickVoice = () => {
        const voices = window.speechSynthesis.getVoices();
        const preferred = voices.find(v =>
          v.name.includes("Samantha") || v.name.includes("Google US English") ||
          v.name.includes("Microsoft Zira") || v.name.includes("Female")
        );
        if (preferred) utterance.voice = preferred;
      };

      pickVoice();
      if (!utterance.voice && window.speechSynthesis.getVoices().length === 0) {
        window.speechSynthesis.onvoiceschanged = () => {
          pickVoice();
          window.speechSynthesis.onvoiceschanged = null;
        };
      }

      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      window.speechSynthesis.speak(utterance);
    });
  }, []);

  const speakText = useCallback(async (text: string): Promise<void> => {
    if (elevenLabsAvailableRef.current === false) {
      return speakWithBrowserFallback(text);
    }

    const played = await playAudioFromServer(text);
    if (played) {
      elevenLabsAvailableRef.current = true;
    } else {
      elevenLabsAvailableRef.current = false;
      console.warn("ElevenLabs TTS unavailable, using browser speech");
      return speakWithBrowserFallback(text);
    }
  }, [playAudioFromServer, speakWithBrowserFallback]);

  const startRecognition = useCallback(() => {
    if (recognitionRef.current || endedRef.current) return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError("Speech recognition is not supported in this browser. Please use Chrome or Edge.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      if (isProcessingRef.current) return;

      let interim = "";
      let finalText = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalText += transcript;
        } else {
          interim += transcript;
        }
      }

      if (interim) setInterimText(interim);

      if (finalText.trim()) {
        setInterimText("");
        handleFinalText(finalText.trim());
      }
    };

    recognition.onerror = (event: any) => {
      if (event.error === "no-speech" || event.error === "aborted") return;
      console.error("Speech recognition error:", event.error);
      if (event.error === "not-allowed") {
        setError("Microphone access denied. Please allow microphone access in your browser settings.");
      }
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      if (shouldListenRef.current && !endedRef.current) {
        setTimeout(() => startRecognition(), 100);
      }
    };

    recognitionRef.current = recognition;
    shouldListenRef.current = true;
    try {
      recognition.start();
    } catch (e) {}
  }, []);

  const handleFinalText = useCallback(async (text: string) => {
    if (!text.trim() || isProcessingRef.current) return;
    isProcessingRef.current = true;

    stopRecognition();
    setPhase("processing");

    try {
      const response = await fetch(`/api/calls/${callId}/voice-turn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) throw new Error("Failed to process");

      const result = await response.json();

      if (result.isComplete) {
        endedRef.current = true;
        setPhase("ended");
        onCallEnded?.();
        return;
      }

      if (result.agentText) {
        setPhase("speaking");
        await speakText(result.agentText);
      }

      setPhase("listening");
      startRecognition();
    } catch (e: any) {
      setError(e.message || "Failed to process speech");
      setPhase("listening");
      startRecognition();
    } finally {
      isProcessingRef.current = false;
    }
  }, [callId, onCallEnded, speakText, stopRecognition, startRecognition]);

  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animFrameRef.current = requestAnimationFrame(draw);
      analyser.getByteTimeDomainData(dataArray);

      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      const barCount = 48;
      const barWidth = width / barCount - 2;
      const centerY = height / 2;

      for (let i = 0; i < barCount; i++) {
        const dataIndex = Math.floor((i / barCount) * bufferLength);
        const value = dataArray[dataIndex] / 128.0;
        const amplitude = Math.abs(value - 1) * centerY * 2.5;
        const barHeight = Math.max(2, amplitude);

        const hue = phase === "speaking" || phase === "greeting" ? 200
          : phase === "processing" ? 45
          : 142;
        const alpha = 0.4 + (amplitude / centerY) * 0.6;

        ctx.fillStyle = `hsla(${hue}, 70%, 55%, ${Math.min(alpha, 1)})`;
        const x = i * (barWidth + 2) + 1;
        const roundedRadius = Math.min(barWidth / 2, 3);

        ctx.beginPath();
        ctx.roundRect(x, centerY - barHeight / 2, barWidth, barHeight, roundedRadius);
        ctx.fill();
      }
    };

    draw();
  }, [phase]);

  useEffect(() => {
    async function initMicrophone() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;

        const audioCtx = new AudioContext();
        audioCtxRef.current = audioCtx;
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.6;
        source.connect(analyser);
        analyserRef.current = analyser;

        const canvas = canvasRef.current;
        if (canvas) {
          canvas.width = canvas.offsetWidth * window.devicePixelRatio;
          canvas.height = canvas.offsetHeight * window.devicePixelRatio;
        }

        drawWaveform();

        if (greetingText) {
          setPhase("speaking");
          await speakText(greetingText);
        }

        setPhase("listening");
        startRecognition();
      } catch (e: any) {
        setError("Microphone access denied. Please allow microphone access and reload.");
      }
    }

    initMicrophone();

    return () => {
      endedRef.current = true;
      shouldListenRef.current = false;
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch (e) {}
        recognitionRef.current = null;
      }
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      if (audioCtxRef.current) audioCtxRef.current.close().catch(() => {});
      window.speechSynthesis?.cancel();
    };
  }, []);

  useEffect(() => {
    drawWaveform();
  }, [phase, drawWaveform]);

  const endCall = useCallback(async () => {
    endedRef.current = true;
    stopRecognition();
    window.speechSynthesis?.cancel();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
    }

    try {
      await fetch(`/api/calls/${callId}/end`, { method: "POST" });
    } catch (e) {
      console.error("Failed to end call:", e);
    }

    setPhase("ended");
    onCallEnded?.();
  }, [callId, onCallEnded, stopRecognition]);

  const phaseConfig: Record<CallPhase, { label: string; icon: any; color: string }> = {
    greeting: { label: "Agent is speaking...", icon: Volume2, color: "text-blue-500" },
    listening: { label: "Listening — speak naturally", icon: Mic, color: "text-green-500" },
    processing: { label: "Processing your response...", icon: Loader2, color: "text-yellow-500" },
    speaking: { label: "Agent is responding...", icon: Volume2, color: "text-blue-500" },
    ended: { label: "Call ended", icon: PhoneOff, color: "text-muted-foreground" },
  };

  const current = phaseConfig[phase];
  const PhaseIcon = current.icon;

  return (
    <Card data-testid="card-voice-chat" className="border-2 border-primary/20 overflow-hidden">
      <CardContent className="p-0">
        <div className="relative bg-gradient-to-b from-background to-muted/30 px-6 pt-5 pb-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className={`relative ${phase === "listening" ? "animate-pulse" : ""}`}>
                <div className={`h-3 w-3 rounded-full ${
                  phase === "listening" ? "bg-green-500" :
                  phase === "speaking" || phase === "greeting" ? "bg-blue-500" :
                  phase === "processing" ? "bg-yellow-500" : "bg-gray-400"
                }`} />
                {phase === "listening" && (
                  <div className="absolute inset-0 h-3 w-3 rounded-full bg-green-500 animate-ping opacity-75" />
                )}
              </div>
              <PhaseIcon className={`h-4 w-4 ${current.color} ${phase === "processing" ? "animate-spin" : ""}`} />
              <span className="text-sm font-medium" data-testid="text-call-phase">{current.label}</span>
            </div>
            {phase !== "ended" && (
              <Button
                size="sm"
                variant="destructive"
                onClick={endCall}
                data-testid="button-end-call"
                className="rounded-full"
              >
                <PhoneOff className="h-3.5 w-3.5 mr-1" />
                End
              </Button>
            )}
          </div>

          <div className="relative h-20 rounded-xl bg-background/50 border border-border/50 overflow-hidden backdrop-blur-sm">
            <canvas
              ref={canvasRef}
              className="w-full h-full"
              data-testid="canvas-waveform"
            />
          </div>

          {interimText && (
            <div className="mt-3 px-3 py-2 rounded-lg bg-primary/5 border border-primary/10">
              <p className="text-sm text-muted-foreground italic" data-testid="text-interim">
                {interimText}...
              </p>
            </div>
          )}
        </div>

        {error && (
          <div className="px-6 py-3 bg-destructive/10 border-t border-destructive/20">
            <p className="text-sm text-destructive" data-testid="text-voice-error">{error}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
