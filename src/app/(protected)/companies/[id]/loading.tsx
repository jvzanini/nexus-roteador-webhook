import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function CompanyLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Breadcrumb skeleton */}
      <div className="h-5 w-40 bg-muted rounded" />

      {/* Header skeleton */}
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-xl bg-muted border border-border/50" />
        <div className="space-y-2">
          <div className="h-7 w-48 bg-muted rounded" />
          <div className="h-4 w-24 bg-muted rounded" />
        </div>
      </div>

      {/* Tabs skeleton */}
      <div className="h-10 w-64 bg-muted rounded-lg border border-border/50" />

      {/* Content skeleton */}
      <Card className="bg-card border border-border rounded-xl">
        <CardHeader>
          <div className="h-5 w-32 bg-muted rounded" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="h-12 bg-muted/50 rounded-lg" />
          <div className="h-12 bg-muted/50 rounded-lg" />
          <div className="h-12 bg-muted/50 rounded-lg" />
        </CardContent>
      </Card>
    </div>
  );
}
