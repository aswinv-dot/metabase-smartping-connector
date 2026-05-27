export default async function handler(req, res) {
  const SMARTPING_API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY3NmU5MTQ2ZjJjOGUzMGJlY2FlMDVkYiIsIm5hbWUiOiJUZXJyYXRlcm4iLCJhcHBOYW1lIjoiQWlTZW5zeSIsImNsaWVudElkIjoiNjc2ZTkxNDZmMmM4ZTMwYmVjYWUwNWNlIiwiYWN0aXZlUGxhbiI6IlBST19NT05USExZIiwiaWF0IjoxNzY5Njc2MzQ2fQ.Oj6veBiRUaPtWZ1yaVgTAp-q_JvCfXC8zuU42_T4rM4";

  // Fetch leads from Metabase public question
  let leads = [];
  try {
    const mbRes = await fetch(
      "https://metabase.terratern.com/api/public/card/7e84f141-e90d-4852-a158-4d6a75bf4833/query/json"
    );
    leads = await mbRes.json();
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch Metabase data", detail: err.message });
  }

  if (!leads.length) {
    return res.status(200).json({ message: "No leads found" });
  }

  const results = [];

  for (const lead of leads) {
    const phone = (lead.mobile || "").replace(/^\+/, "").replace(/\D/g, "");
    const name  = lead.fullname || "User";

    if (!phone) {
      results.push({ skipped: true, name, reason: "no_phone" });
      continue;
    }

    const payload = {
      apiKey:       SMARTPING_API_KEY,
      campaignName: "ghcalum_api",
      destination:  phone,
      userName:     name,
      templateParams: [
        "1 hour",
        "15 May",
        "6PM IST",
        "meet.google.com/ocz-xymg-dgf",
        "storiesbyachu",
        "0987654"
      ],
      source:         "metabase-webhook",
      media:          {},
      buttons:        [],
      carouselCards:  [],
      location:       {},
      attributes:     {},
      paramsFallbackValue: { FirstName: "user" },
    };

    try {
      const response = await fetch("https://backend.api-wa.co/campaign/smartping/api/v2", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });

      const data = await response.json();
      results.push({ success: response.ok, phone, name, status: response.status, data });

    } catch (err) {
      results.push({ success: false, phone, name, error: err.message });
    }
  }

  return res.status(200).json({ total: leads.length, processed: results.length, results });
}
