#!/usr/bin/env python3
"""MCP stub for Cyware API execution (developer mode only)."""
from __future__ import annotations

import json
import os
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
                        "serverInfo": {"name": "cyware-api-mcp-stub", "version": "0.1.0"},
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
                                "name": "cyware_request",
                                "description": "Execute a Cyware API request (requires credentials)",
                                "inputSchema": {
                                    "type": "object",
                                    "properties": {
                                        "method": {"type": "string"},
                                        "path": {"type": "string"},
                                        "body": {"type": "object"},
                                    },
                                    "required": ["method", "path"],
                                },
                            }
                        ],
                    },
                }
            )
        elif method == "tools/call":
            params_obj = req.get("params") or {}
            product = (params_obj.get("arguments") or {}).get("product", "ctix")
            prefix = str(product).upper()
            base = os.environ.get(f"{prefix}_BASE_URL", "")
            if not base:
                send(
                    {
                        "jsonrpc": "2.0",
                        "id": req_id,
                        "result": {
                            "content": [
                                {
                                    "type": "text",
                                    "text": f"{prefix}_BASE_URL not set — add product credentials to .env.local",
                                }
                            ],
                            "isError": True,
                        },
                    }
                )
            else:
                send(
                    {
                        "jsonrpc": "2.0",
                        "id": req_id,
                        "result": {"content": [{"type": "text", "text": "Stub — wire real HTTP client here."}]},
                    }
                )
        else:
            send({"jsonrpc": "2.0", "id": req_id, "error": {"code": -32601, "message": "Not found"}})


if __name__ == "__main__":
    main()
