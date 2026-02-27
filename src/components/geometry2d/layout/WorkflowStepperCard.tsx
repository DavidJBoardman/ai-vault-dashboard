"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { Geometry2DWorkflowSection } from "@/components/geometry2d/types";

interface WorkflowStepperCardProps {
  activeSection: Geometry2DWorkflowSection;
  onSectionChange: (section: Geometry2DWorkflowSection) => void;
}

const SECTIONS: Array<{ id: Geometry2DWorkflowSection; label: string }> = [
  { id: "roi", label: "A ROI & Bay Proportion" },
  { id: "nodes", label: "B Node Alignment" },
  { id: "matching", label: "C Cut-Typology" },
  { id: "reconstruct", label: "D Bay Plan Reconstruction" },
  { id: "report", label: "E Report" },
];

export function WorkflowStepperCard({ activeSection, onSectionChange }: WorkflowStepperCardProps) {
  return (
    <Card>
      <CardHeader className="pb-3 pt-3">
        <CardTitle className="text-base font-medium">Workflow Stages</CardTitle>
        <CardDescription className="text-xs">
          Focus on one stage at a time to reduce UI clutter
        </CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-2 lg:grid-cols-5 gap-2">
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
