import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // On gère nous-mêmes la documentation du projet ; pas de génération
  // automatique de AGENTS.md/CLAUDE.md par Next.js.
  agentRules: false,
};

export default nextConfig;
