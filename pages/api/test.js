export default async function handler(req, res) {
  const SMARTPING_API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY3NmU5MTQ2ZjJjOGUzMGJlY2FlMDVkYiIsIm5hbWUiOiJUZXJyYXRlcm4iLCJhcHBOYW1lIjoiQWlTZW5zeSIsImNsaWVudElkIjoiNjc2ZTkxNDZmMmM4ZTMwYmVjYWUwNWNlIiwiYWN0aXZlUGxhbiI6IlBST19NT05USExZIiwiaWF0IjoxNzY5Njc2MzQ2fQ.Oj6veBiRUaPtWZ1yaVgTAp-q_JvCfXC8zuU42_T4rM4";

  const payload = {
    apiKey:         SMARTPING_API_KEY,
    campaignName:   "ghcalum",
    destination:    "917094956963",
    userName:       "Aswin",
    templateParams: [
      "1 hour",
      "15 May",
      "6PM IST",
      "meet.google.com/ocz-xymg-dgf",
      "storiesbyachu",
      "0987654"
    ],
    source:        "test-script",
    media:         {},
    buttons:       [],
    carouselCards: [],
    location:      {},
  };

  const response = await fetch("https://backend.aisensy.com/campaign/t1/api/v2", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(payload),
  });

  const data = await response.json();
  return res.status(200).json({ status: response.status, data });
}
