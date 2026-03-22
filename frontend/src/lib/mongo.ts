import { MongoClient, type Db } from "mongodb";

const mongoUri = process.env.MONGODB_URI;
const mongoDbName = process.env.MONGODB_DB_NAME || "wonder";

declare global {
  var wonderSharedMongoClientPromise: Promise<MongoClient> | undefined;
}

function getClientPromise() {
  if (!mongoUri) {
    throw new Error("MONGODB_URI is required");
  }

  const existing = globalThis.wonderSharedMongoClientPromise;
  if (existing) return existing;

  const nextPromise = new MongoClient(mongoUri).connect();
  if (process.env.NODE_ENV !== "production") {
    globalThis.wonderSharedMongoClientPromise = nextPromise;
  }
  return nextPromise;
}

export async function getMongoDb(): Promise<Db> {
  const client = await getClientPromise();
  return client.db(mongoDbName);
}
