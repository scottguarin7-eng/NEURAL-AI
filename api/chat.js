const MODEL = "gemini-3.8-flash";
const MAX_ATTEMPTS = 4;
const REQUEST_TIMEOUT = 30000;

function sleep(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function retryable(status) {
  return [
    408,
    425,
    429,
    500,
    502,
    503,
    504
  ].includes(status);
}

function retryDelay(attempt) {
  const exponential = 900 * Math.pow(2, attempt);
  const jitter = Math.floor(Math.random() * 450);

  return exponential + jitter;
}

async function callGemini({
  apiKey,
  message,
  signal
}) {
  const endpoint =
    "https://generativelanguage.googleapis.com/v1beta/models/" +
    MODEL +
    ":generateContent";

  return fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: message
            }
          ]
        }
      ],
      generationConfig: {
        maxOutputTokens: 1024
      }
    }),
    signal
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Only POST requests are allowed."
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  const message = String(
    req.body?.message || ""
  ).trim();

  if (!apiKey) {
    return res.status(500).json({
      error: "GEMINI_API_KEY is missing in Vercel."
    });
  }

  if (!message) {
    return res.status(400).json({
      error: "Message is required."
    });
  }

  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, REQUEST_TIMEOUT);

  try {
    let lastStatus = 503;
    let lastMessage =
      "Gemini is temporarily unavailable.";

    for (
      let attempt = 0;
      attempt < MAX_ATTEMPTS;
      attempt++
    ) {
      try {
        const response = await callGemini({
          apiKey,
          message,
          signal: controller.signal
        });

        const data = await response.json().catch(() => ({}));

        if (response.ok) {
          const text =
            data?.candidates?.[0]?.content?.parts?.[0]?.text;

          if (!text) {
            return res.status(502).json({
              error: "Gemini returned no text."
            });
          }

          return res.status(200).json({
            text,
            model: MODEL,
            attempts: attempt + 1
          });
        }

        lastStatus = response.status;
        lastMessage =
          data?.error?.message ||
          "Gemini request failed.";

        if (!retryable(response.status)) {
          return res.status(response.status).json({
            error: lastMessage
          });
        }

        if (attempt < MAX_ATTEMPTS - 1) {
          await sleep(retryDelay(attempt));
        }
      } catch (error) {
        if (error.name === "AbortError") {
          return res.status(504).json({
            error: "Gemini request timed out."
          });
        }

        lastMessage = error.message;

        if (attempt < MAX_ATTEMPTS - 1) {
          await sleep(retryDelay(attempt));
        }
      }
    }

    return res.status(lastStatus).json({
      error:
        lastMessage +
        " Please try again shortly."
    });
  } finally {
    clearTimeout(timeout);
  }
}
