"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

export function IdleWatch({ minutes }: { minutes: number }) {
  const [warn, setWarn] = useState(false);
  const last = useRef(Date.now());
  useEffect(() => {
    let touched = 0;
    const bump = () => {
      last.current = Date.now();
      setWarn(false);
      if (Date.now() - touched > 30_000) {
        touched = Date.now();
        void fetch("/api/session", { method: "POST" });
      }
    };
    const events = ["pointerdown", "keydown"] as const;
    events.forEach((event) => window.addEventListener(event, bump));
    const timer = window.setInterval(() => {
      const idle = Date.now() - last.current;
      const limit = minutes * 60 * 1000;
      if (idle >= limit) {
        void fetch("/api/session", { method: "DELETE" }).finally(() => {
          window.location.href = "/sign-in?reason=idle";
        });
      } else if (idle >= limit - 30_000) setWarn(true);
    }, 1000);
    return () => {
      window.clearInterval(timer);
      events.forEach((event) => window.removeEventListener(event, bump));
    };
  }, [minutes]);
  if (!warn) return null;
  return (
    <div className="no-print fixed right-4 bottom-4 z-50 max-w-sm rounded-2xl bg-card p-4 shadow-lg ring-1 ring-foreground/10">
      <p className="font-medium">Still there?</p>
      <p className="mt-1 text-sm text-muted-foreground">You will be signed out in a few seconds.</p>
      <Button
        className="mt-3 h-9"
        onClick={() => {
          last.current = Date.now();
          setWarn(false);
          void fetch("/api/session", { method: "POST" });
        }}
      >
        Stay signed in
      </Button>
    </div>
  );
}
