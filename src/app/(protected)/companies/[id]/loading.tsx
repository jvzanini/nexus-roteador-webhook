import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function CompanyLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Breadcrumb skeleton */}
      <div className="h-5 w-40 bg-zinc-800 rounded" />

      {/* Header skeleton */}
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-xl bg-zinc-800 border border-zinc-700/50" />
        <div className="space-y-2">
          <div className="h-7 w-48 bg-zinc-800 rounded" />
          <div className="h-4 w-24 bg-zinc-800 rounded" />
        </div>
      </div>

      {/* Tabs skeleton */}
      <div className="h-10 w-64 bg-zinc-800 rounded-lg border border-zinc-700/50" />

      {/* Content skeleton */}
      <Card className="bg-zinc-900 border border-zinc-800 rounded-xl">
        <CardHeader>
          <div className="h-5 w-32 bg-zinc-800 rounded" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="h-12 bg-zinc-800/50 rounded-lg" />
          <div className="h-12 bg-zinc-800/50 rounded-lg" />
          <div className="h-12 bg-zinc-800/50 rounded-lg" />
        </CardContent>
      </Card>
    </div>
  );
}
