export default async function handler(req, res) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: "GEMINI_API_KEY is missing."
    });
  }

  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models?key=" +
        encodeURIComponent(apiKey)
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return res.status(response.status).json({
        error:
          data?.error?.message ||
          "Could not list Gemini models.",
        status: response.status
      });
    }

    const models = (data.models || [])
      .filter((model) => {
        return Array.isArray(
          model.supportedGenerationMethods
        ) &&
        model.supportedGenerationMethods.includes(
          "generateContent"
        );
      })
      .map((model) => ({
        name: model.name,
        displayName: model.displayName,
        methods: model.supportedGenerationMethods
      }));

    return res.status(200).json({
      models
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message
    });
  }
}
