import 'server-only';

import { createGoogleVertex } from '@ai-sdk/google-vertex';

const VERTEX_PROJECT = '955684370207';
const VERTEX_LOCATION = 'global';

const googleVertex = createGoogleVertex({
  project: VERTEX_PROJECT,
  location: VERTEX_LOCATION,
  baseURL:
    `https://aiplatform.googleapis.com/v1/projects/${VERTEX_PROJECT}/locations/${VERTEX_LOCATION}/publishers/google`,
});

export const VERTEX_MODEL_ID = 'gemini-3.1-flash-lite';

export const vertexModel = googleVertex(VERTEX_MODEL_ID);
