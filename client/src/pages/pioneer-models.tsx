import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Database, Brain, Play, CheckCircle2, XCircle, RefreshCw, Zap, Upload, BarChart3 } from "lucide-react";

interface Dataset {
  id: string;
  name: string;
  dataset_name?: string;
  dataset_type?: string;
  type?: string;
  status?: string;
  row_count?: number;
  created_at?: string;
  version?: number;
}

interface TrainingJob {
  id: string;
  job_id?: string;
  model_name?: string;
  status?: string;
  base_model?: string;
  progress?: number;
  created_at?: string;
  completed_at?: string;
  metrics?: any;
}

export default function PioneerModelsPage() {
  const { toast } = useToast();
  const [modelName, setModelName] = useState("haven-housing-model");
  const [selectedDataset, setSelectedDataset] = useState<{ id: string; name: string } | null>(null);
  const [pollingJobId, setPollingJobId] = useState<string | null>(null);

  const datasetsQuery = useQuery<{ datasets: Dataset[] }>({
    queryKey: ["/api/pioneer/datasets"],
    refetchInterval: 10000,
  });

  const jobsQuery = useQuery<{ jobs: TrainingJob[] }>({
    queryKey: ["/api/pioneer/training-jobs"],
    refetchInterval: pollingJobId ? 5000 : 15000,
  });

  const activeModelQuery = useQuery<{ activeModelId: string | null }>({
    queryKey: ["/api/pioneer/active-model"],
  });

  const jobStatusQuery = useQuery<TrainingJob>({
    queryKey: ["/api/pioneer/training-jobs", pollingJobId],
    enabled: !!pollingJobId,
    refetchInterval: 5000,
  });

  useEffect(() => {
    if (jobStatusQuery.data?.status === "complete" || jobStatusQuery.data?.status === "errored") {
      setPollingJobId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/pioneer/training-jobs"] });
    }
  }, [jobStatusQuery.data?.status]);

  const createNerDataset = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/pioneer/datasets/create-ner");
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "NER Dataset Created", description: `Dataset ID: ${data.datasetId}` });
      queryClient.invalidateQueries({ queryKey: ["/api/pioneer/datasets"] });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create dataset", description: err.message, variant: "destructive" });
    },
  });

  const createClassificationDataset = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/pioneer/datasets/create-classification");
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Classification Dataset Created", description: `Dataset ID: ${data.datasetId}` });
      queryClient.invalidateQueries({ queryKey: ["/api/pioneer/datasets"] });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create dataset", description: err.message, variant: "destructive" });
    },
  });

  const startTraining = useMutation({
    mutationFn: async () => {
      if (!selectedDataset) throw new Error("Select a dataset first");
      const res = await apiRequest("POST", "/api/pioneer/training-jobs", {
        datasetName: selectedDataset.name,
        modelName,
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Training Started", description: `Job ID: ${data.jobId}` });
      setPollingJobId(data.jobId);
      queryClient.invalidateQueries({ queryKey: ["/api/pioneer/training-jobs"] });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to start training", description: err.message, variant: "destructive" });
    },
  });

  const activateModel = useMutation({
    mutationFn: async (modelId: string) => {
      const res = await apiRequest("POST", "/api/pioneer/active-model", { modelId });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Model Activated", description: `All inference now uses model: ${data.activeModelId}` });
      queryClient.invalidateQueries({ queryKey: ["/api/pioneer/active-model"] });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to activate model", description: err.message, variant: "destructive" });
    },
  });

  const deactivateModel = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/pioneer/active-model", { modelId: "" });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Using Base Model", description: "Switched back to GLiNER-2 base model" });
      queryClient.invalidateQueries({ queryKey: ["/api/pioneer/active-model"] });
    },
  });

  const datasets = datasetsQuery.data?.datasets || [];
  const jobs = jobsQuery.data?.jobs || [];
  const activeModelId = activeModelQuery.data?.activeModelId;

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case "complete":
        return <Badge className="bg-green-500/10 text-green-500 border-green-500/20" data-testid="badge-status-complete"><CheckCircle2 className="h-3 w-3 mr-1" />Complete</Badge>;
      case "running":
        return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20" data-testid="badge-status-running"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Running</Badge>;
      case "requested":
        return <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20" data-testid="badge-status-requested"><RefreshCw className="h-3 w-3 mr-1" />Requested</Badge>;
      case "errored":
        return <Badge className="bg-red-500/10 text-red-500 border-red-500/20" data-testid="badge-status-errored"><XCircle className="h-3 w-3 mr-1" />Error</Badge>;
      default:
        return <Badge variant="secondary" data-testid="badge-status-unknown">{status || "Unknown"}</Badge>;
    }
  };

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6" data-testid="page-pioneer-models">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Pioneer AI — Model Vibetuning</h1>
          <p className="text-muted-foreground">Fine-tune custom GLiNER models for housing & homelessness entity extraction</p>
        </div>
        <div className="flex items-center gap-2">
          {activeModelId ? (
            <Badge className="bg-green-500/10 text-green-500 border-green-500/20" data-testid="badge-active-model">
              <Zap className="h-3 w-3 mr-1" />Custom Model Active: {activeModelId.substring(0, 8)}...
            </Badge>
          ) : (
            <Badge variant="secondary" data-testid="badge-base-model">
              <Brain className="h-3 w-3 mr-1" />Using GLiNER-2 Base
            </Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card data-testid="card-datasets">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Training Datasets
            </CardTitle>
            <CardDescription>
              Upload specialized housing/homelessness training data to Pioneer
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => createNerDataset.mutate()}
                disabled={createNerDataset.isPending}
                size="sm"
                data-testid="button-create-ner-dataset"
              >
                {createNerDataset.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                Create NER Dataset
              </Button>
              <Button
                onClick={() => createClassificationDataset.mutate()}
                disabled={createClassificationDataset.isPending}
                size="sm"
                variant="outline"
                data-testid="button-create-classification-dataset"
              >
                {createClassificationDataset.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                Create Classification Dataset
              </Button>
            </div>

            {datasetsQuery.isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : datasets.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4" data-testid="text-no-datasets">
                No datasets yet. Create one above to get started.
              </p>
            ) : (
              <div className="space-y-2">
                {datasets.map((ds) => {
                  const dsId = ds.id || ds.dataset_name || ds.name;
                  const dsName = ds.name || ds.dataset_name || dsId;
                  const isSelected = selectedDataset?.id === dsId;
                  return (
                    <div
                      key={dsId}
                      className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                        isSelected
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      }`}
                      onClick={() => setSelectedDataset(isSelected ? null : { id: dsId, name: dsName })}
                      data-testid={`card-dataset-${dsId}`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-sm">{ds.name || ds.dataset_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {ds.dataset_type || ds.type || "NER"} · {ds.row_count ?? "?"} rows
                            {ds.version ? ` · v${ds.version}` : ""}
                          </p>
                        </div>
                        <Badge variant={ds.status === "ready" ? "default" : "secondary"}>
                          {ds.status || "ready"}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-training">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5" />
              Train Custom Model
            </CardTitle>
            <CardDescription>
              Fine-tune a GLiNER model on your housing data using Pioneer's vibetuning platform
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Model Name</label>
              <Input
                value={modelName}
                onChange={(e) => setModelName(e.target.value)}
                placeholder="haven-housing-model"
                data-testid="input-model-name"
              />
            </div>

            {selectedDataset ? (
              <p className="text-sm text-muted-foreground">
                Selected: <span className="font-medium">{selectedDataset.name}</span>
              </p>
            ) : (
              <p className="text-sm text-yellow-500">
                Select a dataset from the left panel to train on
              </p>
            )}

            <Button
              onClick={() => startTraining.mutate()}
              disabled={!selectedDataset || startTraining.isPending || !modelName}
              className="w-full"
              data-testid="button-start-training"
            >
              {startTraining.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              Start Training
            </Button>

            {pollingJobId && jobStatusQuery.data && (
              <div className="p-3 rounded-lg border border-blue-500/20 bg-blue-500/5">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium">Training in Progress</p>
                  {getStatusBadge(jobStatusQuery.data.status)}
                </div>
                <p className="text-xs text-muted-foreground font-mono">
                  Job: {pollingJobId}
                </p>
                {jobStatusQuery.data.progress !== undefined && (
                  <div className="mt-2 w-full bg-secondary rounded-full h-2">
                    <div
                      className="bg-primary h-2 rounded-full transition-all"
                      style={{ width: `${jobStatusQuery.data.progress}%` }}
                    />
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card data-testid="card-training-jobs">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Training Jobs
          </CardTitle>
          <CardDescription>
            View all training jobs and deploy completed models for inference
          </CardDescription>
        </CardHeader>
        <CardContent>
          {jobsQuery.isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : jobs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8" data-testid="text-no-jobs">
              No training jobs yet. Create a dataset and start training above.
            </p>
          ) : (
            <div className="space-y-3">
              {jobs.map((job) => {
                const jobId = job.id || job.job_id || "";
                const isActive = activeModelId === jobId;
                return (
                  <div
                    key={jobId}
                    className={`p-4 rounded-lg border ${
                      isActive ? "border-green-500/30 bg-green-500/5" : "border-border"
                    }`}
                    data-testid={`card-job-${jobId}`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{job.model_name || "Untitled Model"}</p>
                          {isActive && (
                            <Badge className="bg-green-500/10 text-green-500 border-green-500/20">
                              <Zap className="h-3 w-3 mr-1" />Active
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          ID: <span className="font-mono">{jobId}</span>
                          {job.base_model && ` · Base: ${job.base_model}`}
                          {job.created_at && ` · ${new Date(job.created_at).toLocaleString()}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {getStatusBadge(job.status)}
                        {job.status === "complete" && !isActive && (
                          <Button
                            size="sm"
                            onClick={() => activateModel.mutate(jobId)}
                            disabled={activateModel.isPending}
                            data-testid={`button-activate-${jobId}`}
                          >
                            <Zap className="h-3 w-3 mr-1" />
                            Activate
                          </Button>
                        )}
                        {isActive && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => deactivateModel.mutate()}
                            disabled={deactivateModel.isPending}
                            data-testid={`button-deactivate-${jobId}`}
                          >
                            Use Base
                          </Button>
                        )}
                      </div>
                    </div>
                    {job.metrics && (
                      <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                        {job.metrics.f1 && <span>F1: {(job.metrics.f1 * 100).toFixed(1)}%</span>}
                        {job.metrics.precision && <span>Precision: {(job.metrics.precision * 100).toFixed(1)}%</span>}
                        {job.metrics.recall && <span>Recall: {(job.metrics.recall * 100).toFixed(1)}%</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {activeModelId && (
            <div className="mt-4 p-3 rounded-lg border border-green-500/20 bg-green-500/5">
              <p className="text-sm">
                <Zap className="h-4 w-4 inline mr-1 text-green-500" />
                Custom model <span className="font-mono text-xs">{activeModelId}</span> is active.
                All entity extraction, classification, and relevance scoring now routes through your fine-tuned model via the <code className="text-xs bg-secondary px-1 rounded">/inference</code> endpoint.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
