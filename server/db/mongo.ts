import { MongoClient, type Db } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";

export type ArisProcessDoc = {
  processId: string;
  name: string;
  description: string;
  keywords?: string[];
  createdAt: Date;
  updatedAt: Date;
};

export type ArisElementDoc =
  | {
      elementId: string;
      processId: string;
      type: "step";
      name: string;
      description?: string;
      order?: number;
      lane?: string;
      createdAt: Date;
      updatedAt: Date;
    }
  | {
      elementId: string;
      processId: string;
      type: "connector";
      fromStepId: string;
      toStepId: string;
      label?: string;
      condition?: string;
      createdAt: Date;
      updatedAt: Date;
    };

export type ConversationDoc = {
  conversationId: string;
  createdAt: Date;
  updatedAt: Date;
};

export type MessageDoc = {
  conversationId: string;
  uiMessageId: string;
  role: "user" | "assistant";
  parts: unknown[];
  metadata?: unknown;
  createdAt: Date;
};

export type FeedbackDoc = {
  conversationId: string;
  targetUiMessageId: string;
  rating: 1 | -1;
  comment?: string;
  createdAt: Date;
  updatedAt: Date;
};

let memoryServer: MongoMemoryServer | null = null;
let client: MongoClient | null = null;
let db: Db | null = null;

export async function getDb() {
  if (db) return db;

  memoryServer = await MongoMemoryServer.create();
  const uri = memoryServer.getUri();
  client = new MongoClient(uri);
  await client.connect();
  db = client.db("aris_demo");

  await ensureIndexes(db);

  return db;
}

export async function closeDb() {
  await client?.close();
  client = null;
  db = null;
  await memoryServer?.stop();
  memoryServer = null;
}

export async function collections(dbArg?: Db) {
  const db = dbArg ?? (await getDb());

  return {
    arisProcesses: db.collection<ArisProcessDoc>("aris_processes"),
    arisElements: db.collection<ArisElementDoc>("aris_elements"),
    conversations: db.collection<ConversationDoc>("conversations"),
    messages: db.collection<MessageDoc>("messages"),
    feedback: db.collection<FeedbackDoc>("feedback"),
  };
}

async function ensureIndexes(db: Db) {
  const {
    arisProcesses,
    arisElements,
    conversations,
    messages,
    feedback,
  } = await collections(db);

  await arisProcesses.createIndex({ processId: 1 }, { unique: true });
  await arisProcesses.createIndex(
    { name: "text", description: "text", keywords: "text" },
    { name: "aris_process_text" },
  );

  await arisElements.createIndex({ elementId: 1 }, { unique: true });
  await arisElements.createIndex({ processId: 1, type: 1, order: 1 });

  await conversations.createIndex({ conversationId: 1 }, { unique: true });

  await messages.createIndex({ conversationId: 1, createdAt: 1 });
  await messages.createIndex({ conversationId: 1, uiMessageId: 1 });

  await feedback.createIndex({ conversationId: 1, targetUiMessageId: 1 }, { unique: true });
  await feedback.createIndex({ conversationId: 1, createdAt: 1 });
}

