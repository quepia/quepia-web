import 'server-only';

import { createGoogleVertex } from '@ai-sdk/google-vertex';

const googleVertex = createGoogleVertex({
  baseURL:
    'https://aiplatform.googleapis.com/v1/projects/955684370207/locations/global/publishers/google',
});

export const VERTEX_MODEL_ID = 'gemini-3.1-flash-lite';

export const vertexModel = googleVertex(VERTEX_MODEL_ID);
