import express from "express";
import { createApp } from "./http-app.js";
import { createTokenVerifier } from "./auth.js";
import { loadConfig } from "./config.js";
import { createDatabaseAccessFactory } from "./database.js";

export const config = loadConfig();
const app: express.Express = createApp({
  config,
  tokenVerifier: createTokenVerifier(config),
  databaseFactory: createDatabaseAccessFactory(config),
});

export default app;
