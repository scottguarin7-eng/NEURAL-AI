const MODEL = "gpt-4o-mini";
const MAX_ATTEMPTS = 2;
const REQUEST_TIMEOUT = 60000;

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function callOpenAI(apiKey, message, signal) {
  const endpoint = "https://api.openai.com/v1/chat/completions";

  return fetch(endpoint, {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + apiKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: "user",
          content: message
        }
      ],
      temperature: 0.7,
      max_tokens: 512
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

  const apiKey = process.env.OPENAI_API_KEY;
  const message = String(
    req.body?.message || ""
  ).trim();

  if (!apiKey) {
    return res.status(500).json({
      error: "OPENAI_API_KEY is missing in Vercel environment variables."
    });
  }

  if (!message) {
    return res.status(400).json({
      error: "Message is required."
    });
  }

  for (
    let attempt = 0;
    attempt < MAX_ATTEMPTS;
    attempt++
  ) {
    const controller = new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
    }, REQUEST_TIMEOUT);

    try {
      const response = await callOpenAI(
        apiKey,
        message,
        controller.signal
      );

      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        const text =
          data?.choices?.[0]?.message?.content;

        if (!text) {
          return res.status(502).json({
            error: "OpenAI returned an empty response.",
            provider: data
          });
        }

        return res.status(200).json({
          text,
          model: MODEL,
          attempts: attempt + 1
        });
      }

      const providerError =
        data?.error?.message ||
        `OpenAI returned HTTP ${response.status}.`;

      const retryable = [
        408,
        429,
        500,
        502,
        503,
        504
      ].includes(response.status);

      if (!retryable || attempt === MAX_ATTEMPTS - 1) {
        return res.status(response.status).json({
          error: providerError,
          status: response.status,
          model: MODEL
        });
      }

      await wait(1500);
    } catch (error) {
      if (
        error.name === "AbortError" &&
        attempt === MAX_ATTEMPTS - 1
      ) {
        return res.status(504).json({
          error:
            "OpenAI did not respond within 60 seconds. " +
            "The provider may be busy or unavailable."
        });
      }

      if (
        error.name !== "AbortError" &&
        attempt === MAX_ATTEMPTS - 1
      ) {
        return res.status(500).json({
          error: error.message
        });
      }

      await wait(1500);
    } finally {
      clearTimeout(timeout);
    }
  }

  return res.status(504).json({
    error: "OpenAI request timed out."
  });
}
