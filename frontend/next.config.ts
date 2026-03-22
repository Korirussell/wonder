import type { NextConfig } from "next";
import { config } from "dotenv";
import { resolve } from "path";

// Load environment variables from the parent directory's .env file
const envPath = resolve(__dirname, "../.env");
config({ path: envPath });

const nextConfig: NextConfig = {
  // Expose environment variables to the application
  env: {
    BACKEND_URL: process.env.BACKEND_URL || "http://localhost:8001",
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    MONGODB_DB_NAME: process.env.MONGODB_DB_NAME,
    MONGODB_URI: process.env.MONGODB_URI,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    SAMPLE_DIR: process.env.SAMPLE_DIR,
    TAG_DB_BACKEND: process.env.TAG_DB_BACKEND,
    TAG_DB_PATH: process.env.TAG_DB_PATH,
    TAG_DB_TABLE: process.env.TAG_DB_TABLE,
    PYTHON_API_URL: process.env.PYTHON_API_URL || "http://localhost:8000",
  },
};

export default nextConfig;
