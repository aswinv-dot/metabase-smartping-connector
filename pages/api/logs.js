// pages/api/logs.js
import { getLogs } from "../../lib/gas";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const data = await getLogs();
  return res.status(200).json(data);
}
