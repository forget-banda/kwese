"use client";

import { Button } from "@/components/ui/button";

export default function DeskError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="max-w-lg">
      <h1 className="font-heading text-3xl font-semibold">The desk hit a problem</h1>
      <p className="mt-2 text-muted-foreground">{error.message || "Try that again."}</p>
      <Button className="mt-4 h-10" onClick={() => reset()}>
        Try again
      </Button>
    </div>
  );
}
