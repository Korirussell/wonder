import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { nextCookies } from "better-auth/next-js";
import { anonymous, username } from "better-auth/plugins";
import { MongoClient } from "mongodb";

const mongoUri = process.env.MONGODB_URI;
const mongoDbName = process.env.MONGODB_DB_NAME || "wonder";

if (!mongoUri) {
  throw new Error("MONGODB_URI is required for authentication");
}

declare global {
  var wonderMongoClientPromise: Promise<MongoClient> | undefined;
}

const clientPromise =
  globalThis.wonderMongoClientPromise ??
  new MongoClient(mongoUri).connect();

if (process.env.NODE_ENV !== "production") {
  globalThis.wonderMongoClientPromise = clientPromise;
}

const client = await clientPromise;
const db = client.db(mongoDbName);

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  secret: process.env.BETTER_AUTH_SECRET,
  database: mongodbAdapter(db, {
    client,
    transaction: false,
  }),
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
    spotify: {
      clientId: process.env.SPOTIFY_CLIENT_ID!,
      clientSecret: process.env.SPOTIFY_CLIENT_SECRET!,
    },
  },
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["email-password", "spotify"],
    },
  },
  plugins: [username(), anonymous(), nextCookies()],
});
