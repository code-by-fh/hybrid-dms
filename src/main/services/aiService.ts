import { getConfig } from './syncEngine.js';

export async function checkOllamaStatus() {
  try {
    const config = getConfig();
    const response = await fetch(`${config.OLLAMA_URL}`);
    if (response.ok) {
      return true;
    }
    return false;
  } catch (error) {
    return false;
  }
}

export async function analyzeDocumentWithAI(text: string) {
  const config = getConfig();
  
  const prompt = `Analyze the following document text and extract the sender, date (in YYYY-MM-DD format), document type (e.g. Invoice, Contract, Receipt, Letter), and 3-5 relevant tags.
Return ONLY a valid JSON object with the following structure:
{
  "sender": "string",
  "date": "YYYY-MM-DD",
  "docType": "string",
  "tags": ["tag1", "tag2"]
}

Document Text:
${text.substring(0, 4000)} // Limit text to avoid token limits
`;

  try {
    const response = await fetch(`${config.OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.OLLAMA_MODEL,
        prompt: prompt,
        stream: false,
        format: "json"
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    const resultText = data.response;
    
    // Parse the JSON
    try {
       const parsed = JSON.parse(resultText);
       return parsed;
    } catch (e) {
       console.error("Failed to parse Ollama JSON response", resultText);
       return null;
    }
  } catch (error) {
    console.error("Error analyzing document with Ollama", error);
    return null;
  }
}
