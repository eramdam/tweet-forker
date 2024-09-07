import { type Request } from "express";

export function parseQuery(req: Request) {
  const url = new URL(
    String(req.query.url || "")
      .replace(/^"/gi, "")
      .replace(/"$/gi, ""),
  );

  const services = String(req.query.services).split(",");

  return {
    url,
    services,
  };
}
