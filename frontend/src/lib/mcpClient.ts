import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "path";
import type Anthropic from "@anthropic-ai/sdk";

let _client: Client | null = null;
let _connecting: Promise<Client> | null = null;

/** Get (or lazily create) the singleton MCP client connected to the Ableton MCP server. */
export async function getMCPClient(): Promise<Client> {
  if (_client) return _client;
  if (_connecting) return _connecting;

  _connecting = (async () => {
    const serverDir = path.join(process.cwd(), "..", "kori-mcp");

    const transport = new StdioClientTransport({
      command: "python",
      args: ["-m", "MCP_Server.server"],
      cwd: serverDir,
      env: Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== undefined)) as Record<string, string>,
    });

    const client = new Client(
      { name: "wonder-frontend", version: "1.0.0" },
      { capabilities: {} }
    );

    await client.connect(transport);
    console.log("[Wonder MCP] Connected to Ableton MCP server");
    _client = client;
    return client;
  })();

  return _connecting;
}

/** List MCP tools and convert them to Anthropic tool format. */
export async function getMCPToolsForClaude(): Promise<Anthropic.Tool[]> {
  const client = await getMCPClient();
  const { tools } = await client.listTools();

  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description ?? "",
    input_schema: (tool.inputSchema as Anthropic.Tool["input_schema"]) ?? {
      type: "object" as const,
      properties: {},
    },
  }));
}

/** Call a single MCP tool and return its result as a string. */
export async function callMCPTool(
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  const client = await getMCPClient();
  const result = await client.callTool({ name, arguments: args });

  // MCP result content can be text or structured — flatten to string
  const content = result.content as Array<{ type: string; text?: string }>;
  return content
    .filter((c) => c.type === "text")
    .map((c) => c.text ?? "")
    .join("\n");
}

/** Reset the client (used if connection drops). */
export function resetMCPClient() {
  _client = null;
  _connecting = null;
}
