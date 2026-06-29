import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface AnalyzeRequest {
  message: string;
}

interface GeminiResponse {
  credibilityScore: number;
  riskLevel: "Low" | "Medium" | "High";
  manipulationTechniques: string[];
  explanation: string;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

// Schema passed to Gemini so the model is constrained to return exactly
// this shape instead of us hoping a "respond only in JSON" instruction works.
const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    credibilityScore: { type: "NUMBER" },
    riskLevel: { type: "STRING", enum: ["Low", "Medium", "High"] },
    manipulationTechniques: {
      type: "ARRAY",
      items: { type: "STRING" },
    },
    explanation: { type: "STRING" },
  },
  required: ["credibilityScore", "riskLevel", "manipulationTechniques", "explanation"],
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { message }: AnalyzeRequest = await req.json();

    if (!message || message.trim().length === 0) {
      return jsonResponse({ error: "Message is required" }, 400);
    }

    // Read the actual secret name, not the key's own value.
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiApiKey) {
      return jsonResponse({ error: "Gemini API key not configured" }, 500);
    }

    const prompt = `Analyze the following message for misinformation, manipulation techniques, and overall credibility.

Message to analyze:
"${message}"`;

    // gemini-1.5-flash has been shut down by Google; gemini-3.5-flash is the
    // current GA Flash model as of mid-2026.
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent`;

    const geminiResponse = await fetch(geminiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": geminiApiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          // Gemini 3.x: leave temperature/top_p/top_k at defaults, they're
          // tuned for this model's reasoning behavior.
          maxOutputTokens: 1024,
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
    });

    if (!geminiResponse.ok) {
      const errorData = await geminiResponse.text();
      console.error("Gemini API error:", errorData);
      return jsonResponse({ error: "Failed to analyze message" }, 500);
    }

    const geminiData = await geminiResponse.json();
    const generatedText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!generatedText) {
      console.error("Empty Gemini response:", JSON.stringify(geminiData));
      return jsonResponse({ error: "No response from AI" }, 500);
    }

    let analysisResult: GeminiResponse;
    try {
      analysisResult = JSON.parse(generatedText);
    } catch (parseError) {
      console.error("Failed to parse Gemini response:", generatedText);
      return jsonResponse({ error: "Failed to parse AI response" }, 500);
    }

    // Return the real result Gemini produced.
    return jsonResponse(analysisResult);
  } catch (error) {
    console.error("Error in analyze function:", error);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
