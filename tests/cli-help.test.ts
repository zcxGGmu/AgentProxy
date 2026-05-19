import { describe, expect, it } from "vitest";
import { AGENTPROXY_VERSION, createProgram, normalizeCliArgv } from "../src/cli/index.js";

describe("agentproxy CLI placeholder", () => {
  it("prints the product name in help", () => {
    const help = createProgram().helpInformation();

    expect(help).toContain("agentproxy");
    expect(help).toContain("Thin control plane");
    expect(help).toContain("doctor");
    expect(help).toContain("provider");
  });

  it("exposes a placeholder version", () => {
    expect(AGENTPROXY_VERSION).toBe("0.1.0");
  });

  it("normalizes the pnpm run argument separator before parsing", () => {
    expect(normalizeCliArgv(["node", "agentproxy", "--", "--help"])).toEqual([
      "node",
      "agentproxy",
      "--help",
    ]);
  });
});
