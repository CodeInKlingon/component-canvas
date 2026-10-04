import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { KlingClient } from "./client.js";
import { KlingError } from "./types.js";

interface Recorded {
  method: string;
  url: string;
  headers: NodeJS.Dict<string | string[]>;
  body: Buffer;
}

/** A minimal in-process stand-in for the kindling daemon HTTP API. */
function startFakeDaemon() {
  const requests: Recorded[] = [];

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const body = Buffer.concat(chunks);
    requests.push({ method: req.method ?? "", url: req.url ?? "", headers: req.headers, body });

    const url = new URL(req.url ?? "/", "http://localhost");

    if (req.method === "GET" && url.pathname === "/info") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ version: "0.17.0-test", kvm: true }));
      return;
    }

    if (req.method === "POST" && url.pathname === "/machines") {
      const spec = JSON.parse(body.toString("utf8")) as { name?: string };
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ id: "abc123", name: spec.name, state: "running", ip: "172.30.0.9" }));
      return;
    }

    if (req.method === "GET" && url.pathname === "/machines/missing") {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ message: "machine missing not found" }));
      return;
    }

    if (req.method === "POST" && url.pathname === "/machines/abc123/exec") {
      res.writeHead(200, { "content-type": "application/x-ndjson" });
      res.write(JSON.stringify({ stream: "stdout", data: Buffer.from("hi\n").toString("base64") }) + "\n");
      res.write(JSON.stringify({ stream: "stderr", data: Buffer.from("warn\n").toString("base64") }) + "\n");
      res.write(JSON.stringify({ exit: 0, duration_ms: 3 }) + "\n");
      res.end();
      return;
    }

    if (req.method === "PUT" && url.pathname === "/machines/abc123/files") {
      res.writeHead(200);
      res.end();
      return;
    }

    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ message: `unexpected ${req.method} ${url.pathname}` }));
  });

  return { server, requests };
}

describe("KlingClient", () => {
  let fake: ReturnType<typeof startFakeDaemon>;
  let client: KlingClient;

  beforeEach(async () => {
    fake = startFakeDaemon();
    await new Promise<void>((resolve) => fake.server.listen(0, "127.0.0.1", resolve));
    const address = fake.server.address();
    if (!address || typeof address === "string") throw new Error("no port");
    client = new KlingClient({ baseUrl: `http://127.0.0.1:${address.port}` });
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => fake.server.close(() => resolve()));
  });

  it("reads /info", async () => {
    await expect(client.info()).resolves.toMatchObject({ version: "0.17.0-test", kvm: true });
  });

  it("sends a run request and returns the machine", async () => {
    const machine = await client.create({ image: "toolchain", name: "demo" });
    expect(machine).toMatchObject({ id: "abc123", state: "running", ip: "172.30.0.9" });
    const sent = fake.requests.find((entry) => entry.url === "/machines");
    expect(JSON.parse(sent!.body.toString("utf8"))).toMatchObject({ image: "toolchain", name: "demo" });
  });

  it("maps non-2xx responses to KlingError with the daemon message", async () => {
    await expect(client.machine("missing")).rejects.toMatchObject({ status: 404, message: "machine missing not found" });
    await client.machine("missing").catch((error) => {
      expect(error).toBeInstanceOf(KlingError);
    });
  });

  it("machineOrNull returns null on 404", async () => {
    await expect(client.machineOrNull("missing")).resolves.toBeNull();
  });

  it("streams exec events in order", async () => {
    const events = [];
    for await (const event of client.execStream("abc123", { cmd: ["echo", "hi"] })) {
      events.push(event);
    }
    expect(events).toEqual([
      { stream: "stdout", data: Buffer.from("hi\n").toString("base64") },
      { stream: "stderr", data: Buffer.from("warn\n").toString("base64") },
      { exit: 0, duration_ms: 3 },
    ]);
  });

  it("writes files with the path, mode and mkdir query", async () => {
    await client.writeFile("abc123", "/src/index.html", "hello", { mode: "0644", mkdir: true });
    const sent = fake.requests.find((entry) => entry.method === "PUT");
    expect(sent!.url).toContain("/machines/abc123/files");
    expect(sent!.url).toContain("path=%2Fsrc%2Findex.html");
    expect(sent!.url).toContain("mode=0644");
    expect(sent!.url).toContain("mkdir=1");
    expect(sent!.body.toString("utf8")).toBe("hello");
  });
});
