// imagenGenerator.js — Google Imagen 4 and Gemini Nano Banana image generation.

import { GoogleGenAI } from '@google/genai';
import { callClaude } from './claude.js';

function getClient() {
  const apiKey = import.meta.env.VITE_GOOGLE_AI_API_KEY;
  if (!apiKey) throw new Error('No Google AI API key found. Add VITE_GOOGLE_AI_API_KEY to your .env file.');
  return new GoogleGenAI({ apiKey });
}

export const IMAGEN_MODELS = {
  NANO_BANANA: {
    id:          'gemini-2.5-flash-image',
    name:        'Nano Banana',
    description: 'Free tier — up to 500 images/day',
    badge:       'FREE',
    free:        true,
  },
  IMAGEN4: {
    id:          'imagen-4.0-generate-001',
    name:        'Imagen 4',
    description: 'Paid — highest quality photorealistic images',
    badge:       'PAID',
    free:        false,
  },
};

// Default model is Nano Banana (free tier)
const DEFAULT_MODEL = IMAGEN_MODELS.NANO_BANANA.id;

// Convert imageBytes (Uint8Array or string) → base64 without Node Buffer
function toBase64(imageBytes) {
  if (!imageBytes) return '';
  if (typeof imageBytes === 'string') return imageBytes;
  const bytes  = new Uint8Array(imageBytes instanceof ArrayBuffer ? imageBytes : imageBytes);
  const chunks = [];
  const CHUNK  = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + CHUNK)));
  }
  return btoa(chunks.join(''));
}

// ── Nano Banana (gemini-2.5-flash-image) via generateContent ─────────────────

async function generateWithNanoBanana(prompt) {
  const client   = getClient();
  const response = await client.models.generateContent({
    model:    IMAGEN_MODELS.NANO_BANANA.id,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config:   { responseModalities: ['TEXT', 'IMAGE'] },
  });

  const parts    = response.candidates?.[0]?.content?.parts ?? [];
  const imgPart  = parts.find((p) => p.inlineData?.mimeType?.startsWith('image'));
  const textPart = parts.find((p) => p.text);

  if (!imgPart?.inlineData) {
    throw new Error('No image was generated. Try a different prompt.');
  }

  const b64  = imgPart.inlineData.data;
  const mime = imgPart.inlineData.mimeType || 'image/png';

  return {
    success:    true,
    images:     [{ dataUrl: `data:${mime};base64,${b64}`, base64: b64, mimeType: mime }],
    model:      IMAGEN_MODELS.NANO_BANANA.id,
    modelName:  'Nano Banana',
    caption:    textPart?.text ?? '',
    prompt,
  };
}

// ── Imagen 4 via generateImages ───────────────────────────────────────────────

async function generateWithImagen4(prompt, aspectRatio = '1:1', count = 1) {
  const client   = getClient();
  const response = await client.models.generateImages({
    model:  IMAGEN_MODELS.IMAGEN4.id,
    prompt,
    config: { numberOfImages: count, aspectRatio, includeRaiReason: true },
  });

  if (!response.generatedImages?.length) {
    throw new Error('No images were generated. The prompt may have been filtered.');
  }

  const images = response.generatedImages.map((img) => {
    const b64 = toBase64(img.image.imageBytes);
    return { dataUrl: `data:image/png;base64,${b64}`, base64: b64, mimeType: 'image/png' };
  });

  return {
    success:   true,
    images,
    model:     IMAGEN_MODELS.IMAGEN4.id,
    modelName: 'Imagen 4',
    caption:   '',
    prompt,
  };
}

// ── Shared error normaliser ───────────────────────────────────────────────────

function normaliseError(err) {
  const msg = err.message ?? '';
  if (msg.includes('API_KEY') || msg.includes('API key') || msg.includes('UNAUTHENTICATED')) {
    return new Error('Invalid Google AI API key. Check VITE_GOOGLE_AI_API_KEY in your .env file.');
  }
  if (msg.includes('SAFETY') || msg.includes('blocked') || msg.includes('filtered')) {
    return new Error('Image blocked by safety filters. Please try a different prompt.');
  }
  if (msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED')) {
    return new Error('Google AI quota exceeded. Please try again later.');
  }
  return err;
}

function isBillingError(err) {
  const msg = err.message ?? '';
  return (
    msg.includes('paid plans') ||
    msg.includes('billing') ||
    msg.includes('upgrade') ||
    msg.includes('PERMISSION_DENIED') ||
    msg.includes('not available') ||
    msg.includes('only available')
  );
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function generateWithImagen(prompt, options = {}) {
  const model       = options.model       || DEFAULT_MODEL;
  const aspectRatio = options.aspectRatio || '1:1';
  const count       = options.count       || 1;

  const wantsImagen4 = model === IMAGEN_MODELS.IMAGEN4.id;

  try {
    if (wantsImagen4) {
      try {
        const result = await generateWithImagen4(prompt, aspectRatio, count);
        return result;
      } catch (err) {
        if (isBillingError(err)) {
          // Silently fall back to Nano Banana and flag it
          const result = await generateWithNanoBanana(prompt);
          return { ...result, fallbackUsed: true };
        }
        throw normaliseError(err);
      }
    }

    // Default: Nano Banana (free)
    return await generateWithNanoBanana(prompt);

  } catch (err) {
    throw normaliseError(err);
  }
}

// ── Prompt enhancement ────────────────────────────────────────────────────────

export async function enhanceImagePrompt(userPrompt) {
  const system = `You are an expert at writing image generation prompts for Google Gemini image models.

Take the user's description and create an enhanced detailed prompt that will produce a stunning image. Include:
- Detailed subject description
- Lighting style (golden hour, studio, dramatic)
- Mood and atmosphere
- Color palette if relevant
- Camera angle or perspective
- Art style if applicable
- Quality keywords: highly detailed, professional

Keep it under 150 words. Return ONLY the enhanced prompt, nothing else.`;

  try {
    const enhanced = await callClaude(
      [{ role: 'user', content: userPrompt }],
      { system, maxTokens: 220 },
    );
    return enhanced.trim() || userPrompt;
  } catch {
    return userPrompt;
  }
}

// ── Aspect ratio helper ───────────────────────────────────────────────────────

export function detectAspectRatio(prompt) {
  const p = prompt.toLowerCase();
  if (p.includes('landscape') || p.includes('wide')      || p.includes('wallpaper') || p.includes('banner'))   return '16:9';
  if (p.includes('portrait')  || p.includes('tall')      || p.includes('vertical')  || p.includes('phone'))    return '9:16';
  if (p.includes('square')    || p.includes('instagram')  || p.includes('profile'))                              return '1:1';
  if (p.includes('photo')     || p.includes('camera'))                                                           return '4:3';
  return '1:1';
}
