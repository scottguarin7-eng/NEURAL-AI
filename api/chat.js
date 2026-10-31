export default async function handler(request, response) {
  if (request.method !== "POST") {
    return response.status(405).json({
      error: "Only POST requests are allowed."
    });
  }

  try {
    const body = request.body || {};
    const message = String(body.message || "").trim();
    const mode = body.mode === "ultra" ? "ultra" : "fast";
    const history = Array.isArray(body.history) ? body.history : [];

    if (!message) {
      return response.status(400).json({
        error: "Please enter a message."
      });
    }

    if (!process.env.GEMINI_API_KEY) {
      return response.status(500).json({
        error: "Missing GEMINI_API_KEY in Vercel."
      });
    }

    const safeHistory = history
      .filter(
        (item) =>
          item &&
          (item.role === "user" || item.role === "model") &&
          typeof item.text === "string"
      )
      .slice(-12)
      .map((item) => ({
        role: item.role,
        parts: [{ text: item.text.slice(0, 12000) }]
      }));

    const systemText =
      mode === "ultra"
        ? "You are Neural Ultra. Answer in clear English. Think carefully, distinguish facts from assumptions, do not invent information, and provide complete internally consistent code when requested. Be practical and accurate."
        : "You are Neural Ultra Fast. Answer in clear English. Be concise, useful, and accurate. Do not invent facts.";

    const contents = [
      ...safeHistory,
      {
        role: "user",
        parts: [{ text: message.slice(0, 12000) }]
      }
    ];

    const gemini = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=" +
        encodeURIComponent(process.env.GEMINI_API_KEY),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemText }]
          },
          contents,
          generationConfig: {
            temperature: mode === "ultra" ? 0.25 : 0.45,
            maxOutputTokens: mode === "ultra" ? 3000 : 1400
          }
        })
      }
    );

    const data = await gemini.json();

    if (!gemini.ok) {
      return response.status(gemini.status).json({
        error: data?.error?.message || "Gemini request failed."
      });
    }

    const text = data?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || "")
      .join("")
      .trim();

    if (!text) {
      return response.status(502).json({
        error: "Gemini returned no text."
      });
    }

    return response.status(200).json({
      text,
      mode
    });
  } catch (error) {
    return response.status(500).json({
      error: "The AI server could not complete the request."
    });
  }
}
