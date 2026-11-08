"use strict";

const { handleBody, Unauthorized } = require("../_lib/mcp");

// Public values. Row level security and the token functions protect the data,
// so no secret key lives on this server.
const SUPABASE_URL = process.env.SUPABASE_URL || "https://rcvwuyixsxxfwtkjepsj.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJjdnd1eWl4c3h4Znd0a2plcHNqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzMTY3MjksImV4cCI6MjA5Nzg5MjcyOX0.M7J4LQ1a35lgShjF0dM3HN1QU-ZksWNFPfg77rYK414";

async function rpc(fn, args) {
  const res = await fetch(SUPABASE_URL + "/rest/v1/rpc/" + fn, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      authorization: "Bearer " + SUPABASE_ANON_KEY
    },
    body: JSON.stringify(args)
  });
  if (!res.ok) throw new Error("Database error " + res.status);
  return res.json();
}

const deps = {
  load: (token) => rpc("mcp_load", { p_token: token }),
  store: (token, data) => rpc("mcp_store", { p_token: token, p_data: data })
};

function send(res, status, body) {
  res.status(status);
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  const token = String((req.query && req.query.token) || "");
  if (!/^[0-9a-f]{64}$/.test(token)) {
    return send(res, 404, { error: "Not found" });
  }

  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "content-type, mcp-protocol-version, mcp-session-id");
    res.status(204);
    return res.end();
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return send(res, 405, {
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed" },
      id: null
    });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (e) {
      return send(res, 400, { jsonrpc: "2.0", error: { code: -32700, message: "Parse error" }, id: null });
    }
  }

  try {
    const out = await handleBody(body, deps, token);
    if (out === null) {
      res.status(202);
      return res.end();
    }
    return send(res, 200, out);
  } catch (e) {
    if (e instanceof Unauthorized) {
      return send(res, 401, {
        jsonrpc: "2.0",
        error: {
          code: -32001,
          message: "This connector link is no longer valid. Make a new one in the dashboard."
        },
        id: null
      });
    }
    return send(res, 500, { jsonrpc: "2.0", error: { code: -32603, message: "Internal error" }, id: null });
  }
};
