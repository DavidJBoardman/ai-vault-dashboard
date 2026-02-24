"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { RefreshCw } from "lucide-react";

export function TemplateMatchingPanel() {
  const [includeStarcut, setIncludeStarcut] = useState(true);
  const [includeCircleInner, setIncludeCircleInner] = useState(true);
  const [includeCircleOuter, setIncludeCircleOuter] = useState(true);
  const [allowCrossTemplates, setAllowCrossTemplates] = useState(true);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium">Template Matching</CardTitle>
        <CardDescription className="text-xs">Configure matching candidates for Step04 boss-cut matching</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2.5">
        <div className="flex items-center justify-between rounded-md border border-border px-2.5 py-2">
          <p className="text-xs font-medium">Include starcut templates (n=2..6)</p>
          <Checkbox checked={includeStarcut} onCheckedChange={(checked) => setIncludeStarcut(checked === true)} />
        </div>
        <div className="flex items-center justify-between rounded-md border border-border px-2.5 py-2">
          <p className="text-xs font-medium">Include circlecut inner</p>
          <Checkbox checked={includeCircleInner} onCheckedChange={(checked) => setIncludeCircleInner(checked === true)} />
        </div>
        <div className="flex items-center justify-between rounded-md border border-border px-2.5 py-2">
          <p className="text-xs font-medium">Include circlecut outer</p>
          <Checkbox checked={includeCircleOuter} onCheckedChange={(checked) => setIncludeCircleOuter(checked === true)} />
        </div>
        <div className="flex items-center justify-between rounded-md border border-border px-2.5 py-2">
          <p className="text-xs font-medium">Allow cross templates (X/Y mixed)</p>
          <Checkbox checked={allowCrossTemplates} onCheckedChange={(checked) => setAllowCrossTemplates(checked === true)} />
        </div>
        <Button className="w-full gap-2" disabled>
          <RefreshCw className="w-4 h-4" />
          Run Template Matching (API pending)
        </Button>
        <p className="text-[11px] text-muted-foreground">
          Frontend controls are staged. Backend route for Step04 execution is not exposed yet.
        </p>
      </CardContent>
    </Card>
  );
}
