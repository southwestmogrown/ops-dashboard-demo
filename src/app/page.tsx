"use client";

import "./globals.css";

import { ShiftName } from "@/lib/types";
import Header from "@/components/Header";
import { useState } from "react";



export default function Home() {
  const [shift, setShift] = useState<ShiftName>("day");

  return (
    <main className="p-8">
      <Header
        shift={shift}
        onShiftChange={setShift}
        lastUpdated={new Date()}
      />
      <div className="p-8">
        <p className="text-slate-400">Components go here.</p>
      </div>
    </main>
  );
}
