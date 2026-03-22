/* eslint-disable @typescript-eslint/no-require-imports */
const path = require("path");
const dotenv = require("dotenv");

// Wonder repo root — single source of truth for env (not `frontend/.env*`).
// Next.js 16 does not support `envDir`; load explicitly before Next reads config.
const wonderRoot = path.join(__dirname, "..");
const loadEnv = (name) =>
  dotenv.config({ path: path.join(wonderRoot, name), quiet: true });
loadEnv(".env");
loadEnv(".env.local");

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    BACKEND_URL: process.env.BACKEND_URL || "http://localhost:8001",
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    MONGODB_DB_NAME: process.env.MONGODB_DB_NAME,
    MONGODB_URI: process.env.MONGODB_URI,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    PYTHON_API_URL: process.env.PYTHON_API_URL || "http://localhost:8000",
    SAMPLE_DIR: process.env.SAMPLE_DIR,
    TAG_DB_BACKEND: process.env.TAG_DB_BACKEND,
    TAG_DB_PATH: process.env.TAG_DB_PATH,
    TAG_DB_TABLE: process.env.TAG_DB_TABLE,
  },
};

module.exports = nextConfig;
