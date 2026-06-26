#!/usr/bin/env python3
"""MCP stub that delegates API import to the Next.js app (use HTTP in production)."""
from __future__ import annotations

import json
import sys


def send(msg: dict) -> None:
    sys.stdout.write(json.dumps(msg) + "\n")
    sys.stdout.flush()


def main() -> None:
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        req = json.loads(line)
        method = req.get("method")
        req_id = req.get("id")
        if method == "initialize":
            send(
                {
                    "jsonrpc": "2.0",
                    "id": req_id,
                    "result": {
                        "protocolVersion": "2024-11-05",
                        "capabilities": {"tools": {}},
                        "serverInfo": {"name": "api-importer-mcp-stub", "version": "0.1.0"},
                    },
                }
            )
        elif method == "tools/list":
            send(
                {
                    "jsonrpc": "2.0",
                    "id": req_id,
                    "result": {
                        "tools": [
                            {
                                "name": "import_postman",
                                "description": "Import a Postman collection URL into Pinecone",
                                "inputSchema": {
                                    "type": "object",
                                    "properties": {"url": {"type": "string"}, "name": {"type": "string"}},
                                    "required": ["url"],
                                },
                            },
                            {
                                "name": "import_openapi",
                                "description": "Import an OpenAPI/Swagger URL",
                                "inputSchema": {
                                    "type": "object",
                                    "properties": {"url": {"type": "string"}, "name": {"type": "string"}},
                                    "required": ["url"],
                                },
                            },
                        ],
                    },
                }
            )
        elif method == "tools/call":
            send(
                {
                    "jsonrpc": "2.0",
                    "id": req_id,
                    "result": {
                        "content": [
                            {
                                "type": "text",
                                "text": "Use POST /api/support/api-import from the app, or npm run dev + Integrations tab.",
                            }
                        ]
                    },
                }
            )
        else:
            send({"jsonrpc": "2.0", "id": req_id, "error": {"code": -32601, "message": "Not found"}})


if __name__ == "__main__":
    main()
