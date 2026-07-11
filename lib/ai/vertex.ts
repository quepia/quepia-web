import 'server-only';

import { createGoogleVertex } from '@ai-sdk/google-vertex';

const googleVertex = createGoogleVertex({
  baseURL:
    'https://aiplatform.googleapis.com/v1/projects/955684370207/locations/global/publishers/google',
});

export const vertexModel = googleVertex('gemini-3.1-flash-lite');
