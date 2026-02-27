import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Phone, Mic, Bot, Activity } from "lucide-react";

interface SentenceEmotion {
  text: string;
  emotion: string;
  confidence: number;
}

interface TranscriptSegment {
  speaker: "caller" | "agent";
  text: string;
  emotion: string;
  confidence: number;
  timestamp: number;
  turnIndex: number;
  sentenceEmotions?: SentenceEmotion[];
}

const EMOTION_COLORS: Record<string, { bg: string; text: string; border: string; label: string }> = {
  anxiety: { bg: "bg-purple-100 dark:bg-purple-900/30", text: "text-purple-800 dark:text-purple-200", border: "border-purple-300 dark:border-purple-700", label: "Anxiety" },
  sadness: { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-800 dark:text-blue-200", border: "border-blue-300 dark:border-blue-700", label: "Sadness" },
  frustration: { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-800 dark:text-red-200", border: "border-red-300 dark:border-red-700", label: "Frustration" },
  hope: { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-800 dark:text-green-200", border: "border-green-300 dark:border-green-700", label: "Hope" },
  urgency: { bg: "bg-orange-100 dark:bg-orange-900/30", text: "text-orange-800 dark:text-orange-200", border: "border-orange-300 dark:border-orange-700", label: "Urgency" },
  gratitude: { bg: "bg-teal-100 dark:bg-teal-900/30", text: "text-teal-800 dark:text-teal-200", border: "border-teal-300 dark:border-teal-700", label: "Gratitude" },
  neutral: { bg: "bg-gray-100 dark:bg-gray-800/50", text: "text-gray-700 dark:text-gray-300", border: "border-gray-300 dark:border-gray-600", label: "Neutral" },
};

function getEmotionStyle(emotion: string) {
  return EMOTION_COLORS[emotion] || EMOTION_COLORS.neutral;
}

interface LiveTranscriptProps {
  callId: string;
  clientId: string;
  onCallEnded?: (data: any) => void;
}

export default function LiveTranscript({ callId, clientId, onCallEnded }: LiveTranscriptProps) {
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [connected, setConnected] = useState(false);
  const [callActive, setCallActive] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    fetch(`/api/calls/${callId}/live-transcript`)
      .then(res => res.json())
      .then(data => {
        if (data.segments?.length) {
          setSegments(data.segments);
        }
        setCallActive(data.active);
      })
      .catch(() => {});

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws/transcript?callId=${callId}&clientId=${clientId}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === "transcript" && msg.data) {
          setSegments(prev => [...prev, msg.data]);
        } else if (msg.type === "call_ended") {
          setCallActive(false);
          onCallEnded?.(msg.data);
        }
      } catch (e) {
        console.error("WS parse error:", e);
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [callId, clientId, onCallEnded]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [segments]);

  const emotionCounts: Record<string, number> = {};
  for (const seg of segments) {
    if (seg.speaker === "caller") {
      emotionCounts[seg.emotion] = (emotionCounts[seg.emotion] || 0) + 1;
    }
  }

  return (
    <Card data-testid="card-live-transcript">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base">Live Transcript</CardTitle>
          {callActive && (
            <Badge variant="default" className="animate-pulse" data-testid="badge-call-active">
              <Activity className="h-3 w-3 mr-1" />
              Live
            </Badge>
          )}
          {!callActive && segments.length > 0 && (
            <Badge variant="secondary" data-testid="badge-call-ended">Completed</Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <span className={`h-2 w-2 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`} />
          <span className="text-xs text-muted-foreground">{connected ? "Connected" : "Disconnected"}</span>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(EMOTION_COLORS).map(([emotion, style]) => (
            <div key={emotion} className="flex items-center gap-1">
              <span className={`h-2.5 w-2.5 rounded-full ${style.bg} ${style.border} border`} />
              <span className="text-[10px] text-muted-foreground">{style.label}</span>
            </div>
          ))}
        </div>

        <div
          ref={scrollRef}
          className="space-y-2 max-h-[400px] overflow-y-auto pr-1"
          data-testid="transcript-segments"
        >
          {segments.length === 0 && callActive && (
            <div className="text-center py-8">
              <Phone className="h-8 w-8 mx-auto text-muted-foreground mb-2 animate-pulse" />
              <p className="text-sm text-muted-foreground">Waiting for call to begin...</p>
              <p className="text-xs text-muted-foreground mt-1">Transcript will appear here in real-time</p>
            </div>
          )}

          {segments.map((segment, idx) => {
            const style = getEmotionStyle(segment.emotion);
            const isCaller = segment.speaker === "caller";

            const hasSentenceEmotions = isCaller && segment.sentenceEmotions && segment.sentenceEmotions.length > 0;

            return (
              <div
                key={idx}
                className={`flex gap-2 ${isCaller ? "" : "flex-row-reverse"}`}
                data-testid={`segment-${idx}`}
              >
                <div className={`shrink-0 flex h-7 w-7 items-center justify-center rounded-full ${isCaller ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                  {isCaller ? <Mic className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
                </div>
                <div className={`flex-1 min-w-0 ${isCaller ? "mr-8" : "ml-8"}`}>
                  <div className={`rounded-lg px-3 py-2 border ${isCaller ? `${style.bg} ${style.border}` : "bg-muted/50 border-muted"}`}>
                    {hasSentenceEmotions ? (
                      <div className="space-y-1">
                        {segment.sentenceEmotions!.map((se, si) => {
                          const seStyle = getEmotionStyle(se.emotion);
                          return (
                            <div key={si} className="flex items-start gap-1.5">
                              <span className={`inline-block mt-1 h-2 w-2 rounded-full shrink-0 ${seStyle.bg} ${seStyle.border} border`} />
                              <span className={`text-sm leading-relaxed ${seStyle.text}`}>
                                {se.text}
                              </span>
                              {se.emotion !== "neutral" && (
                                <Badge variant="outline" className={`text-[9px] h-3.5 px-1 shrink-0 ${seStyle.text} ${seStyle.border}`}>
                                  {getEmotionStyle(se.emotion).label}
                                </Badge>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className={`text-sm leading-relaxed ${isCaller ? style.text : "text-foreground"}`}>
                        {segment.text}
                      </p>
                    )}
                  </div>
                  <div className={`flex items-center gap-1.5 mt-0.5 flex-wrap ${isCaller ? "" : "justify-end"}`}>
                    <span className="text-[10px] text-muted-foreground">
                      {isCaller ? "Caller" : "Agent"}
                    </span>
                    {isCaller && segment.emotion !== "neutral" && (
                      <Badge variant="outline" className={`text-[10px] h-4 px-1 ${style.text} ${style.border}`}>
                        {style.label} {Math.round(segment.confidence * 100)}%
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {Object.keys(emotionCounts).length > 0 && (
          <div className="pt-2 border-t">
            <p className="text-xs text-muted-foreground mb-1.5">Caller Emotion Distribution</p>
            <div className="flex gap-1.5 flex-wrap">
              {Object.entries(emotionCounts)
                .sort((a, b) => b[1] - a[1])
                .map(([emotion, count]) => {
                  const style = getEmotionStyle(emotion);
                  const total = Object.values(emotionCounts).reduce((a, b) => a + b, 0);
                  const pct = Math.round((count / total) * 100);
                  return (
                    <Badge key={emotion} variant="outline" className={`${style.text} ${style.border} text-xs`}>
                      {style.label} {pct}%
                    </Badge>
                  );
                })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
