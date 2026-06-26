#!/usr/bin/env python3
"""Minimal MCP stdio server stub for log search integration.

Wire real log providers via LOG_PROVIDER, LOG_API_KEY, LOG_BASE_URL env vars.
"""
from __future__ import annotations

import json
import os
import sys


def send(msg: dict) -> None:
    sys.stdout.write(json.dumps(msg) + "\n")
    sys.stdout.flush()


def handle_initialize(params: dict) -> dict:
    return {
        "protocolVersion": "2024-11-05",
        "capabilities": {"tools": {}},
        "serverInfo": {"name": "logs-mcp-stub", "version": "0.1.0"},
    }


def handle_tools_list() -> dict:
    return {
        "tools": [
            {
                "name": "search_logs",
                "description": "Search production logs by request ID, endpoint, or status code",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "requestId": {"type": "string"},
                        "endpoint": {"type": "string"},
                        "statusCode": {"type": "integer"},
                        "since": {"type": "string"},
                    },
                },
            }
        ]
    }


def handle_tools_call(name: str, arguments: dict) -> dict:
    if name != "search_logs":
        return {"content": [{"type": "text", "text": f"Unknown tool: {name}"}], "isError": True}
    provider = os.environ.get("LOG_PROVIDER", "unset")
    if provider == "unset" or not os.environ.get("LOG_API_KEY"):
        return {
            "content": [
                {
                    "type": "text",
                    "text": "LOG_PROVIDER and LOG_API_KEY not configured — returning empty result.",
                }
            ]
        }
    return {
        "content": [
            {
                "type": "text",
                "text": json.dumps(
                    {"entries": [], "provider": provider, "query": arguments},
                    indent=2,
                ),
            }
        ]
    }


def main() -> None:
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        req = json.loads(line)
        method = req.get("method")
        req_id = req.get("id")
        params = req.get("params") or {}
        result = None
        if method == "initialize":
            result = handle_initialize(params)
        elif method == "tools/list":
            result = handle_tools_list()
        elif method == "tools/call":
            result = handle_tools_call(params.get("name", ""), params.get("arguments") or {})
        else:
            send({"jsonrpc": "2.0", "id": req_id, "error": {"code": -32601, "message": f"Method not found: {method}"}})
            continue
        send({"jsonrpc": "2.0", "id": req_id, "result": result})


if __name__ == "__main__":
    main()
