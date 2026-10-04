import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

describe("loadConfig", () => {
  it("defaults to the local unix socket and the preview port window", () => {
    const config = loadConfig({});
    expect(config.port).toBe(7100);
    expect(config.klingSock).toBe("/run/kling.sock");
    expect(config.klingUrl).toBeUndefined();
    expect(config.previewPortBase).toBe(7200);
    expect(config.previewPortMax).toBe(7299);
    expect(config.previewHost).toBe("127.0.0.1");
    expect(config.previewBindHost).toBe("0.0.0.0");
    expect(config.klingImage).toBe("toolchain");
  });

  it("prefers KLING_URL over the socket", () => {
    const config = loadConfig({ KLING_URL: "http://127.0.0.1:7749" });
    expect(config.klingUrl).toBe("http://127.0.0.1:7749");
    expect(config.klingSock).toBeUndefined();
  });

  it("parses numbers and domain lists, and derives the port window", () => {
    const config = loadConfig({
      PREVIEW_PORT_BASE: "7300",
      PREVIEW_PORT_MAX: "7310",
      ALLOW_DOMAINS: "a.example, b.example ,",
      EGRESS: "internet",
    });
    expect(config.previewPortBase).toBe(7300);
    expect(config.previewPortMax).toBe(7310);
    expect(config.allowDomains).toEqual(["a.example", "b.example"]);
    expect(config.egress).toBe("internet");
  });

  it("falls back to defaults for malformed numbers", () => {
    const config = loadConfig({ PORT: "not-a-number", MEM_MIB: "" });
    expect(config.port).toBe(7100);
    expect(config.memMib).toBe(1024);
  });
});
