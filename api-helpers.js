const { GoogleGenerativeAI } = require("@google/generative-ai");

const apiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);

const model = genAI.getGenerativeModel({
  model: "gemini-1.5-pro",
});

const generationConfig = {
  temperature: 0.7,
  topP: 0.95,
  topK: 64,
  maxOutputTokens: 8192
};

async function getExplanation(question, userAnswer, correctAnswer) {
  try 
  {
    const chatSession = model.startChat({
      generationConfig,
      history: [
      ],
    });

    const prompt = `Please explain and help the user understand this question step by step:
    Question: ${question}
    User's answer: ${userAnswer}
    Correct answer: ${correctAnswer}`;
    
    const result = await chatSession.sendMessage(prompt);
    return result.response.text();
  } 
  catch (error) 
  {
    console.error('Gemini API error:', error);
    throw error;
  }
}

module.exports = { getExplanation };
