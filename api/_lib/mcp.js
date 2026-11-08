"use strict";

// Minimal MCP server logic (Streamable HTTP, stateless JSON responses).
// It exposes three tools so a user's own Claude can research a company with
// its web search and save the results into their dashboard.

const PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const LIST_FIELDS = ["products", "competitors", "news", "questions"];
const MAX_ITEM = 400;
const MAX_ABOUT = 700;
const MAX_PER_CALL = 8;
const MAX_PER_FIELD = 40;
const MAX_COMPANIES = 200;

const INSTRUCTIONS =
  "This connector reads and writes the user's Interview Prep Dashboard. " +
  "When asked to research a company for an interview, use web search for current facts, " +
  "then call save_research once with short, verified items. " +
  "Add the month and year to news items. Only include a LinkedIn URL you actually found. " +
  "Leave out anything you are unsure about, and tell the user what you saved.";

class Unauthorized extends Error {}

const listProp = (description) => ({
  type: "array",
  items: { type: "string" },
  description
});

const TOOLS = [
  {
    name: "list_companies",
    description:
      "List the companies saved in the user's Interview Prep Dashboard, with interview dates and how much research each has.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true }
  },
  {
    name: "get_company",
    description:
      "Get everything saved for one company: overview, links, products, competitors, news, and questions to ask.",
    inputSchema: {
      type: "object",
      properties: { company: { type: "string", description: "Company name" } },
      required: ["company"],
      additionalProperties: false
    },
    annotations: { readOnlyHint: true }
  },
  {
    name: "save_research",
    description:
      "Save interview research for a company into the dashboard. Creates the company if it is new and merges new items into existing notes without duplicates. Keep every item to one short line.",
    inputSchema: {
      type: "object",
      properties: {
        company: { type: "string", description: "Company name" },
        website: { type: "string", description: "Official website URL" },
        linkedin: {
          type: "string",
          description: "Company LinkedIn page URL, only if you found it"
        },
        about: {
          type: "string",
          description: "Two plain sentences on what the company does and who it serves"
        },
        products: listProp("Up to 8 short items about their products or services"),
        competitors: listProp("Up to 8 short items naming competitors"),
        news: listProp("Up to 8 short recent news items, each with month and year when known"),
        questions: listProp("Up to 8 sharp questions the user could ask in the interview"),
        interview_date: { type: "string", description: "Interview date as YYYY-MM-DD" },
        mark_done: { type: "boolean", description: "Set the Done checkbox" }
      },
      required: ["company"],
      additionalProperties: false
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true }
  }
];

function clean(value, max) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function cleanList(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const v of value) {
    const s = clean(v, MAX_ITEM);
    if (s) out.push(s);
    if (out.length >= MAX_PER_CALL) break;
  }
  return out;
}

function httpUrl(value, hostSuffix) {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const u = new URL(value.trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") return "";
    if (hostSuffix) {
      const h = u.hostname.toLowerCase();
      if (h !== hostSuffix && !h.endsWith("." + hostSuffix)) return "";
    }
    return u.href;
  } catch (e) {
    return "";
  }
}

function isDate(s) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function normalize(data) {
  const d = data && typeof data === "object" && !Array.isArray(data) ? data : {};
  if (!Array.isArray(d.companies)) d.companies = [];
  if (!("selected" in d)) d.selected = null;
  return d;
}

function findCompany(data, name) {
  const n = clean(name, 200).toLowerCase();
  if (!n) return null;
  return data.companies.find((c) => clean(c && c.name, 200).toLowerCase() === n) || null;
}

function addItems(company, field, items) {
  if (!Array.isArray(company[field])) company[field] = [];
  const seen = new Set(company[field].map((x) => String(x).toLowerCase()));
  let added = 0;
  for (const item of items) {
    if (company[field].length >= MAX_PER_FIELD) break;
    if (seen.has(item.toLowerCase())) continue;
    company[field].push(item);
    seen.add(item.toLowerCase());
    added++;
  }
  return added;
}

function count(c, field) {
  return Array.isArray(c[field]) ? c[field].length : 0;
}

function summary(c) {
  return {
    name: c.name,
    interview_date: c.date || null,
    done: !!c.done,
    has_overview: !!(c.about || c.website || c.linkedin),
    products: count(c, "products"),
    competitors: count(c, "competitors"),
    news: count(c, "news"),
    questions: count(c, "questions")
  };
}

function result(value, isError) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  const out = { content: [{ type: "text", text }] };
  if (isError) out.isError = true;
  return out;
}

async function load(deps, token) {
  const data = await deps.load(token);
  if (data === null || data === undefined) throw new Unauthorized("invalid token");
  return normalize(data);
}

async function callTool(name, args, deps, token) {
  args = args && typeof args === "object" && !Array.isArray(args) ? args : {};

  if (name === "list_companies") {
    const data = await load(deps, token);
    return result({ count: data.companies.length, companies: data.companies.map(summary) });
  }

  if (name === "get_company") {
    const data = await load(deps, token);
    const c = findCompany(data, args.company);
    if (!c) {
      return result(
        'No company named "' + clean(args.company, 100) + '" is saved yet. Use list_companies to see what is saved, or save_research to add it.',
        true
      );
    }
    return result({
      name: c.name,
      interview_date: c.date || null,
      done: !!c.done,
      about: c.about || "",
      website: c.website || "",
      linkedin: c.linkedin || "",
      products: c.products || [],
      competitors: c.competitors || [],
      news: c.news || [],
      questions: c.questions || []
    });
  }

  if (name === "save_research") {
    const companyName = clean(args.company, 120);
    if (!companyName) return result("company is required.", true);

    const data = await load(deps, token);
    let c = findCompany(data, companyName);
    let created = false;
    if (!c) {
      if (data.companies.length >= MAX_COMPANIES) {
        return result("The dashboard already holds the maximum number of companies.", true);
      }
      c = {
        id: newId(),
        name: companyName,
        date: "",
        done: false,
        products: [],
        competitors: [],
        news: [],
        questions: []
      };
      data.companies.push(c);
      created = true;
      if (!data.selected) data.selected = c.id;
    }

    const changes = [];
    const warnings = [];

    const about = clean(args.about, MAX_ABOUT);
    if (about) {
      c.about = about;
      changes.push("overview");
    }

    if (args.website) {
      const site = httpUrl(args.website);
      if (site) {
        c.website = site;
        changes.push("website");
      } else warnings.push("website ignored because it is not a valid http or https URL");
    }

    if (args.linkedin) {
      const li = httpUrl(args.linkedin, "linkedin.com");
      if (li) {
        c.linkedin = li;
        changes.push("linkedin");
      } else warnings.push("linkedin ignored because it is not a linkedin.com URL");
    }

    if (args.interview_date) {
      if (isDate(args.interview_date)) {
        c.date = args.interview_date;
        changes.push("interview date");
      } else warnings.push("interview_date ignored because it is not a valid YYYY-MM-DD date");
    }

    if (typeof args.mark_done === "boolean") {
      c.done = args.mark_done;
      changes.push(args.mark_done ? "marked done" : "marked not done");
    }

    for (const field of LIST_FIELDS) {
      const added = addItems(c, field, cleanList(args[field]));
      if (added) changes.push(added + " new " + field);
    }

    const ok = await deps.store(token, data);
    if (!ok) {
      return result(
        "Saving failed. The connector link may have been replaced. Make a new link in the dashboard.",
        true
      );
    }
    const out = { saved: true, company: c.name, created, changes };
    if (warnings.length) out.warnings = warnings;
    return result(out);
  }

  return null;
}

const rpcResult = (id, value) => ({ jsonrpc: "2.0", id, result: value });
const rpcError = (id, code, message) => ({ jsonrpc: "2.0", id, error: { code, message } });

async function handleMessage(msg, deps, token) {
  if (!msg || typeof msg !== "object" || Array.isArray(msg)) {
    return rpcError(null, -32600, "Invalid request");
  }
  if (msg.method === undefined) return null; // a response or noise, nothing to do
  if (msg.id === undefined || msg.id === null) return null; // notification

  const { id, method, params } = msg;
  try {
    switch (method) {
      case "initialize": {
        await load(deps, token); // reject bad links at the first step
        const asked = params && params.protocolVersion;
        return rpcResult(id, {
          protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[0],
          capabilities: { tools: {} },
          serverInfo: { name: "interview-prep-dashboard", version: "1.0.0" },
          instructions: INSTRUCTIONS
        });
      }
      case "ping":
        return rpcResult(id, {});
      case "tools/list":
        return rpcResult(id, { tools: TOOLS });
      case "tools/call": {
        const out = await callTool(params && params.name, params && params.arguments, deps, token);
        if (out === null) return rpcError(id, -32602, "Unknown tool");
        return rpcResult(id, out);
      }
      default:
        return rpcError(id, -32601, "Method not found");
    }
  } catch (e) {
    if (e instanceof Unauthorized) throw e;
    return rpcError(id, -32603, "Something went wrong. Please try again.");
  }
}

async function handleBody(body, deps, token) {
  if (Array.isArray(body)) {
    if (!body.length) return rpcError(null, -32600, "Invalid request");
    const out = [];
    for (const m of body) {
      const r = await handleMessage(m, deps, token);
      if (r) out.push(r);
    }
    return out.length ? out : null;
  }
  return handleMessage(body, deps, token);
}

module.exports = { handleBody, handleMessage, Unauthorized, TOOLS, PROTOCOLS };
