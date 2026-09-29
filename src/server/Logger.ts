import * as logsAPI from "@opentelemetry/api-logs";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import {
  LoggerProvider,
  SimpleLogRecordProcessor,
} from "@opentelemetry/sdk-logs";
import { OpenTelemetryTransportV3 } from "@opentelemetry/winston-transport";
import * as dotenv from "dotenv";
import winston from "winston";
import { getOtelResource } from "./OtelResource";
import { ServerEnv } from "./ServerEnv";
// openfront-light: quiet, so dotenv does not print its "injected env (0)
// from .env, tip: ..." banner once per process (master + every worker).
dotenv.config({ quiet: true });

const resource = getOtelResource();

if (ServerEnv.otelEnabled()) {
  console.log("OTEL enabled");
  // Configure OpenTelemetry endpoint with basic auth (if provided)
  const headers: Record<string, string> = {};
  headers["Authorization"] = "Basic " + ServerEnv.otelAuthHeader();
  // Add OTLP exporter for logs
  const logExporter = new OTLPLogExporter({
    url: `${ServerEnv.otelEndpoint()}/v1/logs`,
    headers,
  });

  // Initialize the OpenTelemetry Logger Provider
  const loggerProvider = new LoggerProvider({
    resource,
    processors: [new SimpleLogRecordProcessor(logExporter)],
  });

  // Set as the global logger provider
  logsAPI.logs.setGlobalLoggerProvider(loggerProvider);
}
// openfront-light: no "No OTLP endpoint ..., remote logging disabled" line
// when OTEL is off. That is the normal state of a self-hosted server, and
// it was printed once per process on every start.

// Custom format to add severity tag based on log level
const addSeverityFormat = winston.format((info) => {
  return {
    ...info,
    severity: info.level,
  };
});

// Define your base/parent logger
const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    addSeverityFormat(),
    winston.format.json(),
  ),
  defaultMeta: {
    service: "openfront",
    environment: ServerEnv.gameEnvName(),
  },
  transports: [
    new winston.transports.Console(),
    new OpenTelemetryTransportV3(),
  ],
});

// Export both the main logger and the child logger factory
export { logger };
