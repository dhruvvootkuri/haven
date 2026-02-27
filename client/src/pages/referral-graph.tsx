import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Network, RefreshCw, Loader2, User, Building2, ArrowRight } from "lucide-react";
import { useState, useCallback, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  MarkerType,
  Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { Client } from "@shared/schema";

interface GraphData {
  nodes: Array<{ id: string; label: string; type: string; data: Record<string, any> }>;
  edges: Array<{ id: string; source: string; target: string; label: string; data: Record<string, any> }>;
}

export default function ReferralGraphPage() {
  const [selectedClient, setSelectedClient] = useState<string>("all");

  const { data: clients } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });

  const { data: graphData, isLoading, refetch, isFetching } = useQuery<GraphData>({
    queryKey: ["/api/referral-graph", selectedClient !== "all" ? selectedClient : undefined],
    queryFn: async () => {
      const url = selectedClient !== "all"
        ? `/api/referral-graph?clientId=${selectedClient}`
        : "/api/referral-graph";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to load graph");
      return res.json();
    },
  });

  const { flowNodes, flowEdges } = useMemo(() => {
    if (!graphData) return { flowNodes: [], flowEdges: [] };

    const nodeColors: Record<string, { bg: string; border: string; text: string }> = {
      Client: { bg: "#3b82f6", border: "#2563eb", text: "#ffffff" },
      Call: { bg: "#8b5cf6", border: "#7c3aed", text: "#ffffff" },
      Program: { bg: "#10b981", border: "#059669", text: "#ffffff" },
    };

    const clientNodes = graphData.nodes.filter(n => n.type === "Client");
    const programNodes = graphData.nodes.filter(n => n.type === "Program");
    const otherNodes = graphData.nodes.filter(n => n.type !== "Client" && n.type !== "Program");

    const fNodes: Node[] = [];
    let yOffset = 0;

    clientNodes.forEach((node, i) => {
      const colors = nodeColors[node.type] || nodeColors.Client;
      fNodes.push({
        id: node.id,
        position: { x: 100, y: i * 200 + 50 },
        data: {
          label: (
            <div className="flex items-center gap-2 px-2 py-1">
              <User className="h-4 w-4" />
              <div className="text-left">
                <div className="font-semibold text-sm">{node.label}</div>
                <div className="text-xs opacity-80">
                  {node.data.urgency && `Urgency: ${node.data.urgency}`}
                </div>
              </div>
            </div>
          ),
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        style: {
          background: colors.bg,
          color: colors.text,
          border: `2px solid ${colors.border}`,
          borderRadius: "8px",
          padding: "4px",
          minWidth: "180px",
        },
      });
      yOffset = Math.max(yOffset, i * 200 + 50);
    });

    programNodes.forEach((node, i) => {
      const colors = nodeColors.Program;
      fNodes.push({
        id: node.id,
        position: { x: 500, y: i * 160 + 30 },
        data: {
          label: (
            <div className="flex items-center gap-2 px-2 py-1">
              <Building2 className="h-4 w-4" />
              <div className="text-left">
                <div className="font-semibold text-xs leading-tight">{node.label.substring(0, 40)}{node.label.length > 40 ? "..." : ""}</div>
                <div className="text-xs opacity-80">{node.data.type || "Program"}</div>
              </div>
            </div>
          ),
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        style: {
          background: colors.bg,
          color: colors.text,
          border: `2px solid ${colors.border}`,
          borderRadius: "8px",
          padding: "4px",
          minWidth: "180px",
          maxWidth: "250px",
        },
      });
    });

    otherNodes.forEach((node, i) => {
      const colors = nodeColors[node.type] || { bg: "#6b7280", border: "#4b5563", text: "#ffffff" };
      fNodes.push({
        id: node.id,
        position: { x: 300, y: (clientNodes.length + i) * 160 + 50 },
        data: { label: node.label },
        style: {
          background: colors.bg,
          color: colors.text,
          border: `2px solid ${colors.border}`,
          borderRadius: "8px",
          padding: "8px",
        },
      });
    });

    const edgeColors: Record<string, string> = {
      MATCHED_TO: "#10b981",
      APPLIED_TO: "#3b82f6",
      ELIGIBLE_FOR: "#f59e0b",
      HAD_CALL: "#8b5cf6",
    };

    const fEdges: Edge[] = graphData.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.label.replace(/_/g, " "),
      type: "smoothstep",
      animated: edge.label === "APPLIED_TO",
      style: { stroke: edgeColors[edge.label] || "#9ca3af", strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed, color: edgeColors[edge.label] || "#9ca3af" },
      labelStyle: { fontSize: 10, fontWeight: 600 },
    }));

    return { flowNodes: fNodes, flowEdges: fEdges };
  }, [graphData]);

  const [nodes, setNodes, onNodesChange] = useNodesState(flowNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(flowEdges);

  useMemo(() => {
    setNodes(flowNodes);
    setEdges(flowEdges);
  }, [flowNodes, flowEdges, setNodes, setEdges]);

  return (
    <div className="p-6 space-y-4 h-full flex flex-col">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2" data-testid="text-graph-title">
            <Network className="h-6 w-6" />
            Referral Graph
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Live visualization of client-to-program connections via Neo4j
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Select value={selectedClient} onValueChange={setSelectedClient}>
            <SelectTrigger className="w-48" data-testid="select-graph-client">
              <SelectValue placeholder="Filter by client" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Clients</SelectItem>
              {clients?.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            data-testid="button-refresh-graph"
          >
            {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <Legend color="bg-blue-500" label="Client" />
        <Legend color="bg-emerald-500" label="Program" />
        <Legend color="bg-purple-500" label="Call" />
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ArrowRight className="h-3 w-3" />
          <span>Animated = Application submitted</span>
        </div>
      </div>

      <Card className="flex-1 min-h-[400px]">
        <CardContent className="p-0 h-full">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <Skeleton className="h-full w-full" />
            </div>
          ) : !graphData?.nodes?.length ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-6">
              <Network className="h-16 w-16 text-muted-foreground/30 mb-4" />
              <p className="text-muted-foreground">No data in the referral graph yet</p>
              <p className="text-xs text-muted-foreground mt-1">Add clients, search for housing, and submit applications to see connections</p>
            </div>
          ) : (
            <div className="h-full w-full" style={{ minHeight: "500px" }}>
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                fitView
                className="rounded-md"
              >
                <Background gap={16} size={1} />
                <Controls />
                <MiniMap
                  nodeColor={(node) => {
                    const bg = (node.style as any)?.background;
                    return bg || "#6b7280";
                  }}
                />
              </ReactFlow>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <div className={`h-3 w-3 rounded-sm ${color}`} />
      <span>{label}</span>
    </div>
  );
}
