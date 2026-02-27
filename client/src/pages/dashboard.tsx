import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Phone, Building2, FileCheck, Plus, ArrowRight } from "lucide-react";
import { Link } from "wouter";
import type { Client } from "@shared/schema";

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useQuery<{
    totalClients: number;
    activeCalls: number;
    totalPrograms: number;
    totalApplications: number;
  }>({ queryKey: ["/api/dashboard/stats"] });

  const { data: clients, isLoading: clientsLoading } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });

  const statCards = [
    { title: "Total Clients", value: stats?.totalClients ?? 0, icon: Users, color: "text-chart-1" },
    { title: "Active Calls", value: stats?.activeCalls ?? 0, icon: Phone, color: "text-chart-2" },
    { title: "Housing Matches", value: stats?.totalPrograms ?? 0, icon: Building2, color: "text-chart-3" },
    { title: "Applications", value: stats?.totalApplications ?? 0, icon: FileCheck, color: "text-chart-4" },
  ];

  return (
    <div className="p-6 space-y-6 overflow-auto h-full">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-dashboard-title">
            Case Worker Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage housing assistance for clients in need
          </p>
        </div>
        <Link href="/clients/new">
          <Button data-testid="button-new-client">
            <Plus className="h-4 w-4 mr-2" />
            New Client
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-2xl font-bold" data-testid={`stat-${stat.title.toLowerCase().replace(/\s/g, "-")}`}>
                  {stat.value}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0">
          <CardTitle className="text-base">Recent Clients</CardTitle>
          <Link href="/clients">
            <Button variant="ghost" size="sm" data-testid="button-view-all-clients">
              View all
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {clientsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : !clients?.length ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Users className="h-12 w-12 text-muted-foreground/50 mb-3" />
              <p className="text-sm text-muted-foreground">No clients yet</p>
              <p className="text-xs text-muted-foreground mt-1">Add a new client to get started</p>
              <Link href="/clients/new">
                <Button variant="outline" size="sm" className="mt-4" data-testid="button-add-first-client">
                  <Plus className="h-4 w-4 mr-1" />
                  Add Client
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {clients.slice(0, 5).map((client) => (
                <Link key={client.id} href={`/clients/${client.id}`}>
                  <div
                    className="flex items-center justify-between gap-4 p-3 rounded-md hover-elevate cursor-pointer"
                    data-testid={`client-row-${client.id}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-medium">
                        {client.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{client.name}</p>
                        <p className="text-xs text-muted-foreground">{client.phoneNumber}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <StatusBadge status={client.status || "new"} />
                      <UrgencyBadge level={client.urgencyLevel || "medium"} />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    new: "outline",
    "in-call": "default",
    assessed: "secondary",
    matched: "secondary",
    applied: "default",
  };
  return (
    <Badge variant={variants[status] || "outline"} data-testid={`badge-status-${status}`}>
      {status}
    </Badge>
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
