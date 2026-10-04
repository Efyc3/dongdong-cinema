"use client";
import { useEffect } from "react";
import { prepareOfflineShell } from "@/lib/offline-shell";

export default function OfflineBoot() {
  useEffect(() => { void prepareOfflineShell(); }, []);
  return null;
}
