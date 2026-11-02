"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

export function PrintButton({ children = "Print" }: { children?: ReactNode }) {
  return <Button onClick={() => window.print()}>{children}</Button>;
}
