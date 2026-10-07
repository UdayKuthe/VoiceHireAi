import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env
dotenv.config({ path: path.join(__dirname, '.env') });

const apiKey = process.env.GOOGLE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;

console.log('====================================================');
console.log('GOOGLE GEMINI API HEALTH CHECK');
console.log('====================================================');

if (!apiKey) {
  console.error('\n❌ ERROR: GOOGLE_GEMINI_API_KEY is not defined in backend/.env');
  process.exit(1);
}

// Display masked key
const maskedKey = apiKey.length > 8 
  ? `${apiKey.slice(0, 4)}...${apiKey.slice(-4)} (length: ${apiKey.length})` 
  : '***';
console.log(`API Key detected: ${maskedKey}`);

const ai = new GoogleGenAI({ apiKey });

// List of models to test
const modelsToTest = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-3.8-flash'
];

async function testModel(modelName) {
  process.stdout.write(`Testing model "${modelName}"... `);
  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: "Reply with exactly: 'Google API is working!'"
    });

    const reply = response.text?.trim() || '(empty response)';
    console.log(`\n  ✅ SUCCESS! Response: "${reply}"`);
    return { model: modelName, success: true, reply };
  } catch (err) {
    const status = err.status || err.statusCode || (err.message.includes('429') ? 429 : (err.message.includes('404') ? 404 : 'ERROR'));
    console.log(`\n  ❌ FAILED (Status: ${status})`);
    
    // Provide user-friendly diagnostic
    if (status === 429 || err.message?.includes('Quota exceeded') || err.message?.includes('RESOURCE_EXHAUSTED')) {
      console.log(`     → Rate limit or daily quota reached for this model.`);
    } else if (status === 404 || err.message?.includes('not found')) {
      console.log(`     → Model "${modelName}" not found or not enabled on this project.`);
    } else if (status === 400 || status === 403 || err.message?.includes('API_KEY_INVALID') || err.message?.includes('PERMISSION_DENIED')) {
      console.log(`     → Invalid API key or permission denied.`);
    } else {
      console.log(`     → Message: ${err.message?.split('\n')[0]}`);
    }
    return { model: modelName, success: false, status, message: err.message };
  }
}

async function run() {
  const results = [];
  for (const model of modelsToTest) {
    const res = await testModel(model);
    results.push(res);
    console.log('----------------------------------------------------');
  }

  const anySuccess = results.some((r) => r.success);
  console.log('\n====================================================');
  console.log('TEST SUMMARY:');
  for (const r of results) {
    console.log(` - ${r.model}: ${r.success ? '✅ WORKING' : `❌ FAILED (${r.status || 'ERROR'})`}`);
  }
  console.log('====================================================');

  if (anySuccess) {
    const workingModel = results.find((r) => r.success).model;
    console.log(`\n🎉 Google API is working! Recommended model: ${workingModel}\n`);
    process.exit(0);
  } else {
    console.log('\n⚠️ Google API is currently not returning responses for the tested models.');
    console.log('Check your API key or quota at https://aistudio.google.com/app/apikey\n');
    process.exit(1);
  }
}

run();
