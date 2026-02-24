"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { Geometry2DWorkflowSection } from "@/components/geometry2d/types";

interface WorkflowStepperCardProps {
  activeSection: Geometry2DWorkflowSection;
  onSectionChange: (section: Geometry2DWorkflowSection) => void;
}

const SECTIONS: Array<{ id: Geometry2DWorkflowSection; label: string }> = [
  { id: "roi", label: "1. ROI & Geometric Analysis" },
  { id: "template", label: "2. Template Matching" },
  { id: "reconstruct", label: "3. Pattern Reconstruction" },
  { id: "export", label: "4. Export" },
];

export function WorkflowStepperCard({ activeSection, onSectionChange }: WorkflowStepperCardProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium">Step 4 Workflow</CardTitle>
        <CardDescription className="text-xs">
          Focus on one stage at a time to reduce UI clutter
        </CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {SECTIONS.map((section) => (
          <Button
            key={section.id}
            variant={activeSection === section.id ? "default" : "outline"}
            size="sm"
            onClick={() => onSectionChange(section.id)}
            className="justify-start"
          >
            {section.label}
          </Button>
        ))}
      </CardContent>
    </Card>
  );
}
