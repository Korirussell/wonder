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
const nextConfig = {};

module.exports = nextConfig;
