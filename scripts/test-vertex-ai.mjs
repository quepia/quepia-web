import { createGoogleVertex } from '@ai-sdk/google-vertex';
import { generateText } from 'ai';

if (!process.env.GOOGLE_VERTEX_API_KEY) {
  throw new Error('Missing GOOGLE_VERTEX_API_KEY');
}

const prompt = process.argv.slice(2).join(' ') || 'Say hello in one short sentence.';

const googleVertex = createGoogleVertex({
  baseURL:
    'https://aiplatform.googleapis.com/v1/projects/955684370207/locations/global/publishers/google',
});

const { text, usage } = await generateText({
  model: googleVertex('gemini-3.1-flash-lite'),
  prompt,
});

console.log(text);
console.error('\nUsage:', usage);
