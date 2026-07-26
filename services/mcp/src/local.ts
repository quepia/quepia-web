import { createServer, type Server } from "node:http";
import app, { config } from "./index.js";

export function startLocalServer(): Server {
  const server = createServer(app);

  server.requestTimeout = config.requestTimeoutMs;
  server.headersTimeout = config.requestTimeoutMs + 1_000;
  server.keepAliveTimeout = 5_000;
  server.maxRequestsPerSocket = 100;

  server.listen(config.port, config.host, () => {
    console.log(
      JSON.stringify({
        level: "info",
        message: "MCP server listening",
        host: config.host,
        port: config.port,
        resource: config.resourceUri,
      }),
    );
  });

  function shutdown(signal: string): void {
    console.log(
      JSON.stringify({
        level: "info",
        message: "MCP server shutting down",
        signal,
      }),
    );
    server.close((error) => {
      process.exitCode = error ? 1 : 0;
    });
    setTimeout(() => {
      process.exitCode = 1;
      server.closeAllConnections();
    }, 10_000).unref();
  }

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  return server;
}

startLocalServer();
