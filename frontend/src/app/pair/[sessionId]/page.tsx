"use client";

import React, { use } from "react";
import PairPage from "../page";

export default function PairSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const resolved = use(params);
  return <PairPage initialCode={resolved.sessionId} />;
}

