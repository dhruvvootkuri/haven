import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Users, Plus, Search, Phone, MapPin } from "lucide-react";
import { Link } from "wouter";
import { useState } from "react";
import type { Client } from "@shared/schema";

export default function ClientsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const { data: clients, isLoading } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });

  const filtered = clients?.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.phoneNumber.includes(searchTerm) ||
    (c.location || "").toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  return (
    <div className="p-6 space-y-6 overflow-auto h-full">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-clients-title">Clients</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage all housing assistance clients</p>
        </div>
        <Link href="/clients/new">
          <Button data-testid="button-new-client-page">
            <Plus className="h-4 w-4 mr-2" />
            New Client
          </Button>
        </Link>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search clients by name, phone, or location..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-9"
          data-testid="input-search-clients"
        />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : !filtered.length ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Users className="h-16 w-16 text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground">
            {searchTerm ? "No clients match your search" : "No clients added yet"}
          </p>
          {!searchTerm && (
            <Link href="/clients/new">
              <Button variant="outline" className="mt-4" data-testid="button-add-client-empty">
                <Plus className="h-4 w-4 mr-1" />
                Add your first client
              </Button>
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((client) => (
            <Link key={client.id} href={`/clients/${client.id}`}>
              <Card className="cursor-pointer hover-elevate h-full" data-testid={`card-client-${client.id}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold">
                        {client.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <CardTitle className="text-sm">{client.name}</CardTitle>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                          <Phone className="h-3 w-3" />
                          {client.phoneNumber}
                        </div>
                      </div>
                    </div>
                    <UrgencyDot level={client.urgencyLevel || "medium"} />
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                    {client.location && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {client.location}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                    <Badge variant="outline" className="text-xs">{client.status || "new"}</Badge>
                    {client.veteranStatus && <Badge variant="secondary" className="text-xs">Veteran</Badge>}
                    {client.hasDisability && <Badge variant="secondary" className="text-xs">Disability</Badge>}
                    {client.hasDependents && <Badge variant="secondary" className="text-xs">Dependents</Badge>}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function UrgencyDot({ level }: { level: string }) {
  const colors: Record<string, string> = {
    critical: "bg-red-500",
    high: "bg-orange-500",
    medium: "bg-yellow-500",
    low: "bg-green-500",
  };
  return (
    <div className="flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${colors[level] || colors.medium}`} />
      <span className="text-xs text-muted-foreground capitalize">{level}</span>
    </div>
  );
}
