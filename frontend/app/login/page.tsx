"use client";
import { Suspense } from "react";
import Welcome from "@/components/Welcome";

export default function LoginPage() {
  return <Suspense fallback={<div className="min-h-screen bg-paper" />}><Welcome /></Suspense>;
}
