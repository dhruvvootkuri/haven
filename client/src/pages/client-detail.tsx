import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  ArrowLeft, Phone, PhoneOff, Search, FileCheck, Send,
  AlertTriangle, CheckCircle2, XCircle, MapPin, Clock,
  Heart, Brain, Loader2, ExternalLink, User, Shield, FileText,
  Sparkles, Tag, Zap
} from "lucide-react";
import { Link } from "wouter";
import { useState, useCallback } from "react";
import type { Client, Call, HousingProgram, EligibilityAssessment, Application } from "@shared/schema";
import LiveTranscript from "@/components/live-transcript";
import VoiceChat from "@/components/voice-chat";

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [activeCallId, setActiveCallId] = useState<string | null>(null);
  const [greetingText, setGreetingText] = useState<string | null>(null);

  const { data: client, isLoading } = useQuery<Client>({
    queryKey: ["/api/clients", id],
  });

  const { data: callHistory } = useQuery<Call[]>({
    queryKey: ["/api/clients", id, "calls"],
  });

  const { data: programs } = useQuery<HousingProgram[]>({
    queryKey: ["/api/clients", id, "housing"],
  });

  const { data: assessments } = useQuery<EligibilityAssessment[]>({
    queryKey: ["/api/clients", id, "eligibility"],
  });

  const { data: applications } = useQuery<Application[]>({
    queryKey: ["/api/clients", id, "applications"],
  });

  const callMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/clients/${id}/call`, {});
      return res.json();
    },
    onSuccess: (data) => {
      setActiveCallId(data.id);
      setGreetingText(data.greetingText || null);
      queryClient.invalidateQueries({ queryKey: ["/api/clients", id, "calls"] });
      queryClient.invalidateQueries({ queryKey: ["/api/clients", id] });
      toast({ title: "Call started", description: "Your microphone is now active. Speak naturally." });
    },
    onError: (e: Error) => toast({ title: "Call failed", description: e.message, variant: "destructive" }),
  });

  const handleCallEnded = useCallback((data?: any) => {
    setActiveCallId(null);
    setGreetingText(null);
    queryClient.invalidateQueries({ queryKey: ["/api/clients", id, "calls"] });
    queryClient.invalidateQueries({ queryKey: ["/api/clients", id] });
    queryClient.invalidateQueries({ queryKey: ["/api/referral-graph"] });
    toast({ title: "Call completed", description: data?.summary || "Transcript analyzed with emotion detection." });
  }, [id, toast]);

  const searchMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/clients/${id}/search-housing`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients", id, "housing"] });
      toast({ title: "Housing search complete", description: "Programs found and scored by relevance." });
    },
    onError: (e: Error) => toast({ title: "Search failed", description: e.message, variant: "destructive" }),
  });

  const eligibilityMutation = useMutation({
    mutationFn: async (programId: string) => {
      const res = await apiRequest("POST", `/api/clients/${id}/eligibility/${programId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients", id, "eligibility"] });
      toast({ title: "Eligibility assessed" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const applyMutation = useMutation({
    mutationFn: async (programId: string) => {
      const res = await apiRequest("POST", `/api/clients/${id}/apply/${programId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients", id, "applications"] });
      toast({ title: "Application submitted", description: "Yutori is processing the application." });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const [fastinoEntities, setFastinoEntities] = useState<Record<string, string[]> | null>(null);
  const [fastinoLoading, setFastinoLoading] = useState(false);

  const extractEntitiesMutation = useMutation({
    mutationFn: async () => {
      setFastinoLoading(true);
      const res = await apiRequest("POST", `/api/clients/${id}/extract-entities`);
      return res.json();
    },
    onSuccess: (data) => {
      setFastinoEntities(data.entities);
      setFastinoLoading(false);
      toast({ title: "Fastino Analysis Complete", description: "GLiNER entities extracted from call transcripts." });
    },
    onError: (e: Error) => {
      setFastinoLoading(false);
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const pipelineMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/clients/${id}/run-pipeline`);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients", id, "housing"] });
      queryClient.invalidateQueries({ queryKey: ["/api/clients", id, "eligibility"] });
      queryClient.invalidateQueries({ queryKey: ["/api/clients", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/referral-graph"] });
      toast({ title: "Pipeline complete", description: `Found ${data.programs?.length || 0} programs with eligibility assessed.` });
    },
    onError: (e: Error) => toast({ title: "Pipeline error", description: e.message, variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="p-6 flex flex-col items-center justify-center h-full">
        <p className="text-muted-foreground">Client not found</p>
        <Link href="/clients"><Button variant="outline" className="mt-4">Back to Clients</Button></Link>
      </div>
    );
  }

  const activeCall = activeCallId || callHistory?.find(c => c.status === "in-progress")?.id;
  const latestCall = callHistory?.[0];

  return (
    <div className="p-6 space-y-6 overflow-auto h-full">
      <div className="flex items-center gap-3">
        <Link href="/clients">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-lg">
              {client.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight" data-testid="text-client-name">{client.name}</h1>
              <p className="text-sm text-muted-foreground">{client.phoneNumber}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" data-testid="badge-client-status">{client.status || "new"}</Badge>
          <UrgencyBadge level={client.urgencyLevel || "medium"} />
          <Button
            variant="default"
            size="sm"
            onClick={() => pipelineMutation.mutate()}
            disabled={pipelineMutation.isPending}
            data-testid="button-run-pipeline"
          >
            {pipelineMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Search className="h-4 w-4 mr-1" />}
            Run Full Pipeline
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="space-y-3 text-sm">
              <InfoRow icon={<User className="h-4 w-4" />} label="Age" value={client.age ? `${client.age} years` : "Unknown"} />
              <InfoRow icon={<MapPin className="h-4 w-4" />} label="Location" value={client.location || "Not provided"} />
              <InfoRow icon={<Shield className="h-4 w-4" />} label="Veteran" value={client.veteranStatus ? "Yes" : "No"} />
              <InfoRow icon={<FileText className="h-4 w-4" />} label="Photo ID" value={client.hasId ? "Available" : "Missing"} />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="space-y-3 text-sm">
              <InfoRow icon={<Heart className="h-4 w-4" />} label="Disability" value={client.hasDisability ? "Yes" : "No"} />
              <InfoRow icon={<User className="h-4 w-4" />} label="Dependents" value={client.hasDependents ? `Yes (${client.dependentCount})` : "No"} />
              <InfoRow icon={<FileText className="h-4 w-4" />} label="Employment" value={client.employmentStatus || "Unknown"} />
              <InfoRow icon={<FileText className="h-4 w-4" />} label="Income" value={client.monthlyIncome ? `$${client.monthlyIncome}/mo` : "No income"} />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="space-y-3 text-sm">
              <InfoRow icon={<FileText className="h-4 w-4" />} label="SSN Doc" value={client.hasSsn ? "Available" : "Missing"} />
              <InfoRow icon={<FileText className="h-4 w-4" />} label="Income Proof" value={client.hasProofOfIncome ? "Available" : "Missing"} />
              <InfoRow icon={<Clock className="h-4 w-4" />} label="Created" value={client.createdAt ? new Date(client.createdAt).toLocaleDateString() : "Unknown"} />
              {client.notes && <InfoRow icon={<FileText className="h-4 w-4" />} label="Notes" value={client.notes} />}
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="call" className="w-full">
        <TabsList className="w-full justify-start flex-wrap">
          <TabsTrigger value="call" data-testid="tab-call">
            <Phone className="h-4 w-4 mr-1" />
            Voice Call
          </TabsTrigger>
          <TabsTrigger value="emotions" data-testid="tab-emotions">
            <Brain className="h-4 w-4 mr-1" />
            Emotions
          </TabsTrigger>
          <TabsTrigger value="housing" data-testid="tab-housing">
            <Search className="h-4 w-4 mr-1" />
            Housing
          </TabsTrigger>
          <TabsTrigger value="eligibility" data-testid="tab-eligibility">
            <FileCheck className="h-4 w-4 mr-1" />
            Eligibility
          </TabsTrigger>
          <TabsTrigger value="applications" data-testid="tab-applications">
            <Send className="h-4 w-4 mr-1" />
            Applications
          </TabsTrigger>
          <TabsTrigger value="ai-analysis" data-testid="tab-ai-analysis">
            <Sparkles className="h-4 w-4 mr-1" />
            AI Analysis
          </TabsTrigger>
        </TabsList>

        <TabsContent value="call" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0">
              <CardTitle className="text-base">Voice Conversation</CardTitle>
              {!activeCall ? (
                <Button
                  onClick={() => callMutation.mutate()}
                  disabled={callMutation.isPending}
                  data-testid="button-initiate-call"
                >
                  {callMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Phone className="h-4 w-4 mr-2" />}
                  Start Call
                </Button>
              ) : (
                <Badge variant="default" className="animate-pulse" data-testid="badge-call-in-progress">In Progress</Badge>
              )}
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Start an AI-powered voice intake conversation. Speak directly into your microphone — the agent will listen, respond with ElevenLabs voice, and the live transcript will appear below with emotion color-coding.
              </p>
            </CardContent>
          </Card>

          {activeCall && (
            <>
              <VoiceChat
                callId={typeof activeCall === "string" ? activeCall : activeCall}
                clientId={client.id}
                greetingText={greetingText || undefined}
                onCallEnded={() => handleCallEnded()}
              />
              <LiveTranscript
                callId={typeof activeCall === "string" ? activeCall : activeCall}
                clientId={client.id}
                onCallEnded={handleCallEnded}
              />
            </>
          )}

          {callHistory && callHistory.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Call History</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {callHistory.map(call => (
                  <div key={call.id} className="p-3 rounded-md bg-muted/50 space-y-2" data-testid={`call-history-${call.id}`}>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">{call.status}</span>
                        {call.sentimentScore !== null && call.sentimentScore !== undefined && (
                          <Badge variant={call.sentimentScore > 0 ? "default" : "secondary"} className="text-xs">
                            Sentiment: {call.sentimentScore > 0 ? "+" : ""}{(call.sentimentScore * 100).toFixed(0)}%
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {call.createdAt ? new Date(call.createdAt).toLocaleString() : ""}
                      </span>
                    </div>
                    {call.summary && <p className="text-xs text-muted-foreground">{call.summary}</p>}
                    {call.emotionData && Array.isArray(call.emotionData) && call.emotionData.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {(call.emotionData as Array<{ emotion: string; confidence: number; text: string }>).slice(0, 6).map((e, i) => (
                          <Badge key={i} variant="outline" className="text-[10px]">
                            {e.emotion} ({Math.round(e.confidence * 100)}%)
                          </Badge>
                        ))}
                      </div>
                    )}
                    {call.transcript && (
                      <details className="text-xs">
                        <summary className="cursor-pointer text-muted-foreground">View transcript</summary>
                        <div className="mt-2 p-2 bg-background rounded text-foreground space-y-1">
                          {call.transcript.split("\n").map((line, i) => {
                            const isCaller = line.startsWith("Caller:");
                            return (
                              <p key={i} className={`${isCaller ? "text-primary font-medium" : "text-muted-foreground"}`}>
                                {line}
                              </p>
                            );
                          })}
                        </div>
                      </details>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="emotions" className="space-y-4">
          <EmotionPanel client={client} latestCall={latestCall} />
        </TabsContent>

        <TabsContent value="housing" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0">
              <CardTitle className="text-base">Housing Program Search</CardTitle>
              <Button
                onClick={() => searchMutation.mutate()}
                disabled={searchMutation.isPending}
                data-testid="button-search-housing"
              >
                {searchMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
                Search via Tavily
              </Button>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Search for housing programs tailored to this client's profile using Tavily AI search. Results are scored by relevance.
              </p>
            </CardContent>
          </Card>

          {programs && programs.length > 0 && (
            <div className="space-y-3">
              {programs.map(program => {
                const assessment = assessments?.find(a => a.programId === program.id);
                const app = applications?.find(a => a.programId === program.id);
                return (
                  <Card key={program.id} data-testid={`card-program-${program.id}`}>
                    <CardContent className="pt-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0 space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-sm font-semibold truncate">{program.name}</h3>
                            <Badge variant="secondary" className="text-xs">{program.programType}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-2">{program.description}</p>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                            {program.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{program.location}</span>}
                            {program.contactInfo && <span>{program.contactInfo}</span>}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">Relevance:</span>
                            <Progress value={(program.relevanceScore || 0) * 100} className="h-2 w-24" />
                            <span className="text-xs font-medium">{Math.round((program.relevanceScore || 0) * 100)}%</span>
                          </div>
                        </div>
                        <div className="flex flex-col gap-2 shrink-0">
                          {program.url && (
                            <a href={program.url} target="_blank" rel="noopener noreferrer">
                              <Button variant="outline" size="sm" data-testid={`button-visit-${program.id}`}>
                                <ExternalLink className="h-3 w-3 mr-1" />
                                Visit
                              </Button>
                            </a>
                          )}
                          {!assessment && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => eligibilityMutation.mutate(program.id)}
                              disabled={eligibilityMutation.isPending}
                              data-testid={`button-check-eligibility-${program.id}`}
                            >
                              <FileCheck className="h-3 w-3 mr-1" />
                              Check
                            </Button>
                          )}
                          {!app && (
                            <Button
                              size="sm"
                              onClick={() => applyMutation.mutate(program.id)}
                              disabled={applyMutation.isPending}
                              data-testid={`button-apply-${program.id}`}
                            >
                              <Send className="h-3 w-3 mr-1" />
                              Apply
                            </Button>
                          )}
                          {app && (
                            <Badge variant="default" className="text-xs">Applied</Badge>
                          )}
                        </div>
                      </div>
                      {assessment && (
                        <div className="mt-3 pt-3 border-t space-y-2">
                          <div className="flex items-center gap-2">
                            {assessment.eligible ? (
                              <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                            ) : (
                              <XCircle className="h-4 w-4 text-red-500" />
                            )}
                            <span className="text-sm font-medium">
                              {assessment.eligible ? "Eligible" : "Not Eligible"} ({Math.round((assessment.score || 0) * 100)}%)
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">{assessment.recommendation}</p>
                          {assessment.missingDocuments && assessment.missingDocuments.length > 0 && (
                            <div className="flex items-center gap-1 flex-wrap">
                              <AlertTriangle className="h-3 w-3 text-yellow-600 dark:text-yellow-400" />
                              <span className="text-xs text-muted-foreground">Missing: {assessment.missingDocuments.join(", ")}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="eligibility" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Eligibility Assessments</CardTitle>
            </CardHeader>
            <CardContent>
              {!assessments?.length ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  No eligibility checks yet. Search for housing programs first, then check eligibility for each one.
                </p>
              ) : (
                <div className="space-y-3">
                  {assessments.map(a => (
                    <div key={a.id} className="p-3 rounded-md bg-muted/50 space-y-2">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          {a.eligible ? <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" /> : <XCircle className="h-4 w-4 text-red-500" />}
                          <span className="text-sm font-medium">Score: {Math.round((a.score || 0) * 100)}%</span>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">{a.recommendation}</p>
                      {a.factors && (
                        <div className="grid grid-cols-2 gap-1 mt-2">
                          {(a.factors as Array<{ factor: string; met: boolean; weight: number }>).map((f, i) => (
                            <div key={i} className="flex items-center gap-1 text-xs">
                              {f.met ? <CheckCircle2 className="h-3 w-3 text-green-600 dark:text-green-400" /> : <XCircle className="h-3 w-3 text-muted-foreground" />}
                              <span className={f.met ? "" : "text-muted-foreground"}>{f.factor}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="applications" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Applications via Yutori</CardTitle>
            </CardHeader>
            <CardContent>
              {!applications?.length ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  No applications submitted yet. Find housing programs and click "Apply" to auto-submit via Yutori.
                </p>
              ) : (
                <div className="space-y-3">
                  {applications.map(app => (
                    <div key={app.id} className="p-3 rounded-md bg-muted/50 space-y-2">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <Badge variant={app.status === "submitted" ? "default" : "secondary"}>{app.status}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {app.submittedAt ? new Date(app.submittedAt).toLocaleString() : "Pending"}
                        </span>
                      </div>
                      {app.notes && <p className="text-xs text-muted-foreground">{app.notes}</p>}
                      {app.yutoriTaskId && (
                        <p className="text-xs text-muted-foreground">Task ID: {app.yutoriTaskId}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ai-analysis" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  Fastino GLiNER Entity Extraction
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Uses Pioneer GLiNER-2 model to extract structured entities from call transcripts
                </p>
              </div>
              <Button
                onClick={() => extractEntitiesMutation.mutate()}
                disabled={fastinoLoading}
                size="sm"
                data-testid="button-extract-entities"
              >
                {fastinoLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Zap className="h-4 w-4 mr-1" />}
                Extract Entities
              </Button>
            </CardHeader>
            <CardContent>
              {!fastinoEntities ? (
                <div className="py-8 text-center space-y-2">
                  <Tag className="h-10 w-10 mx-auto text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">
                    Click "Extract Entities" to run Fastino GLiNER analysis on this client's call transcripts.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    The model identifies housing needs, locations, health conditions, employment details, and more.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <EntityCard
                      label="Housing Needs"
                      entities={fastinoEntities.housing_need || []}
                      color="bg-blue-500"
                      emptyText="None detected"
                    />
                    <EntityCard
                      label="Location Preferences"
                      entities={fastinoEntities.location_preference || []}
                      color="bg-emerald-500"
                      emptyText="None detected"
                    />
                    <EntityCard
                      label="Health Conditions"
                      entities={fastinoEntities.health_condition || []}
                      color="bg-red-500"
                      emptyText="None detected"
                    />
                    <EntityCard
                      label="Employment Details"
                      entities={fastinoEntities.employment_detail || []}
                      color="bg-amber-500"
                      emptyText="None detected"
                    />
                    <EntityCard
                      label="Family Situation"
                      entities={fastinoEntities.family_situation || []}
                      color="bg-purple-500"
                      emptyText="None detected"
                    />
                    <EntityCard
                      label="Document Types"
                      entities={fastinoEntities.document_type || []}
                      color="bg-cyan-500"
                      emptyText="None detected"
                    />
                    <EntityCard
                      label="Urgency Indicators"
                      entities={fastinoEntities.urgency_indicator || []}
                      color="bg-orange-500"
                      emptyText="None detected"
                    />
                    <EntityCard
                      label="Service Needs"
                      entities={fastinoEntities.service_need || []}
                      color="bg-teal-500"
                      emptyText="None detected"
                    />
                  </div>
                  <div className="pt-2 border-t">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Sparkles className="h-3 w-3" />
                      Powered by Fastino Pioneer GLiNER-2 — Entity extraction via <code className="bg-muted px-1 rounded">extract_entities</code> task
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {programs && programs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Search className="h-4 w-4" />
                  Fastino Relevance Scoring
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Housing programs scored by GLiNER relevance classification (60% Fastino + 40% Tavily)
                </p>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {[...programs].sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0)).map(program => (
                    <div key={program.id} className="flex items-center gap-3 p-2 rounded-md bg-muted/50" data-testid={`fastino-score-${program.id}`}>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{program.name}</p>
                        <p className="text-xs text-muted-foreground">{program.programType}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Progress value={(program.relevanceScore || 0) * 100} className="h-2 w-20" />
                        <span className="text-sm font-semibold tabular-nums w-12 text-right">
                          {Math.round((program.relevanceScore || 0) * 100)}%
                        </span>
                        <Badge
                          variant={
                            (program.relevanceScore || 0) >= 0.8 ? "default" :
                            (program.relevanceScore || 0) >= 0.5 ? "secondary" : "outline"
                          }
                          className="text-[10px] w-20 justify-center"
                        >
                          {(program.relevanceScore || 0) >= 0.8 ? "Highly Relevant" :
                           (program.relevanceScore || 0) >= 0.5 ? "Moderate" : "Low"}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {assessments && assessments.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <FileCheck className="h-4 w-4" />
                  Fastino Eligibility Classification
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Multi-factor eligibility assessment using GLiNER <code className="bg-muted px-1 rounded">classify_text</code>
                </p>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {assessments.map(a => {
                    const program = programs?.find(p => p.id === a.programId);
                    return (
                      <div key={a.id} className="p-3 rounded-md border space-y-2" data-testid={`fastino-eligibility-${a.id}`}>
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2">
                            {a.eligible ? (
                              <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                            ) : (
                              <XCircle className="h-4 w-4 text-red-500" />
                            )}
                            <span className="text-sm font-medium">
                              {program?.name || "Program"} — {Math.round((a.score || 0) * 100)}%
                            </span>
                          </div>
                          <Badge variant={a.eligible ? "default" : "secondary"}>
                            {a.eligible ? "Eligible" : "Not Eligible"}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{a.recommendation}</p>
                        {a.factors && (
                          <div className="grid grid-cols-2 gap-1">
                            {(a.factors as Array<{ factor: string; met: boolean; weight: number }>).map((f, i) => (
                              <div key={i} className="flex items-center gap-1 text-xs">
                                {f.met ? (
                                  <CheckCircle2 className="h-3 w-3 text-green-600 dark:text-green-400 shrink-0" />
                                ) : (
                                  <XCircle className="h-3 w-3 text-red-400 shrink-0" />
                                )}
                                <span className={f.met ? "" : "text-muted-foreground"}>{f.factor}</span>
                                <span className="text-muted-foreground ml-auto">({Math.round(f.weight * 100)}%)</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function EmotionPanel({ client, latestCall }: { client: Client; latestCall?: Call }) {
  const profile = client.emotionProfile as Record<string, number> | null;
  const emotions = latestCall?.emotionData as Array<{ timestamp: number; emotion: string; confidence: number; text: string }> | null;

  const emotionColors: Record<string, string> = {
    anxiety: "bg-purple-500",
    sadness: "bg-blue-500",
    frustration: "bg-red-500",
    hope: "bg-green-500",
    urgency: "bg-orange-500",
    gratitude: "bg-emerald-500",
    neutral: "bg-gray-400",
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Brain className="h-4 w-4" />
          Emotion Analysis (OpenAI)
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!profile && !emotions ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No emotion data yet. Complete a call to see emotion analysis.
          </p>
        ) : (
          <div className="space-y-6">
            {profile && (
              <div className="space-y-3">
                <h4 className="text-sm font-medium">Emotion Profile</h4>
                <div className="space-y-2">
                  {Object.entries(profile)
                    .sort(([, a], [, b]) => b - a)
                    .map(([emotion, score]) => (
                      <div key={emotion} className="space-y-1">
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="capitalize font-medium">{emotion}</span>
                          <span className="text-muted-foreground">{Math.round(score * 100)}%</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${emotionColors[emotion] || "bg-gray-400"}`}
                            style={{ width: `${Math.round(score * 100)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}
            {latestCall?.sentimentScore !== undefined && latestCall?.sentimentScore !== null && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Overall Sentiment</h4>
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="h-3 bg-gradient-to-r from-red-500 via-yellow-400 to-green-500 rounded-full relative">
                      <div
                        className="absolute top-1/2 -translate-y-1/2 h-5 w-5 rounded-full bg-background border-2 border-foreground"
                        style={{ left: `${((latestCall.sentimentScore + 1) / 2) * 100}%`, transform: "translate(-50%, -50%)" }}
                      />
                    </div>
                  </div>
                  <span className="text-sm font-medium w-12 text-right">
                    {latestCall.sentimentScore > 0 ? "+" : ""}{latestCall.sentimentScore.toFixed(2)}
                  </span>
                </div>
              </div>
            )}
            {emotions && emotions.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-sm font-medium">Emotion Timeline</h4>
                <div className="space-y-2 max-h-64 overflow-auto">
                  {emotions.map((e, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <div className={`h-2 w-2 rounded-full mt-1.5 shrink-0 ${emotionColors[e.emotion] || "bg-gray-400"}`} />
                      <div className="min-w-0">
                        <span className="font-medium capitalize">{e.emotion}</span>
                        <span className="text-muted-foreground ml-1">({Math.round(e.confidence * 100)}%)</span>
                        <p className="text-muted-foreground mt-0.5 break-words">{e.text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground shrink-0">{icon}</span>
      <span className="text-muted-foreground shrink-0 w-24">{label}</span>
      <span className="font-medium truncate">{value}</span>
    </div>
  );
}

function EntityCard({ label, entities, color, emptyText }: { label: string; entities: string[]; color: string; emptyText: string }) {
  return (
    <div className="p-3 rounded-md border space-y-2">
      <div className="flex items-center gap-2">
        <div className={`h-2.5 w-2.5 rounded-full ${color}`} />
        <span className="text-sm font-medium">{label}</span>
        <Badge variant="outline" className="text-[10px] ml-auto">{entities.length}</Badge>
      </div>
      {entities.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {entities.map((entity, i) => (
            <Badge key={i} variant="secondary" className="text-xs">
              {entity}
            </Badge>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{emptyText}</p>
      )}
    </div>
  );
}

function UrgencyBadge({ level }: { level: string }) {
  const colors: Record<string, string> = {
    critical: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    high: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
    medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
    low: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${colors[level] || colors.medium}`}>
      {level}
    </span>
  );
}
