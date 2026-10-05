import test from 'node:test';
import assert from 'node:assert/strict';
import { projectModule } from '../../scripts/lib/load-project-module.mjs';
const calls = [];
let providerError = false;
const { POST } = projectModule('app/contacto/enviar/route.ts', {
  resend: { Resend: class { emails = { send: async payload => { calls.push(payload); return providerError ? { error: { message: 'Rejected' } } : { data: { id: 'test-inquiry' } }; } }; } },
  '@react-email/components': { render: async () => '<p>Test</p>' },
  '@/components/emails/ContactFormEmail': { default: props => props, __esModule: true },
});
const base = { name: 'Prueba local', email: 'test@example.com', service: 'asesoramiento', message: 'Consulta de prueba local', website: '' };
function request(body, origin = 'http://localhost:3105') { return new Request('http://localhost:3105/contacto/enviar', { method: 'POST', headers: { 'Content-Type': 'application/json', origin }, body: JSON.stringify(body) }); }
test('server receives minimal email and WhatsApp inquiries through mocked provider', async () => {
  process.env.RESEND_API_KEY = 're_test'; process.env.EMAIL_FROM = 'test@example.com';
  let response = await POST(request(base));
  assert.equal(response.status, 200); assert.equal((await response.json()).id, 'test-inquiry');
  assert.equal(calls.at(-1).replyTo, 'test@example.com');
  response = await POST(request({ ...base, contactMethod: 'whatsapp', email: '', whatsapp: '+54 9 351 123 4567', plan: 'Plus', attribution: { utm_source: 'local-test', gclid: 'test-id' } }));
  assert.equal(response.status, 200); assert.equal(calls.at(-1).replyTo, undefined);
});
test('invalid contact, plan, service, spam and cross-origin requests never send email', async () => {
  const count = calls.length;
  for (const changes of [{ email: 'bad' }, { name: ' ' }, { contactMethod: 'whatsapp', email: '', whatsapp: '123' }, { plan: 'Fake' }, { service: 'fake' }, { website: 'spam' }, { message: 'short' }, { attribution: { gclid: 'x'.repeat(201) } }]) {
    assert.equal((await POST(request({ ...base, ...changes }))).status, 400);
  }
  assert.equal((await POST(request(base, 'https://other.example'))).status, 403);
  assert.equal(calls.length, count);
});
test('provider failure and missing configuration cannot report success', async () => {
  providerError = true;
  assert.equal((await POST(request(base))).status, 502);
  providerError = false;
  delete process.env.RESEND_API_KEY;
  assert.equal((await POST(request(base))).status, 503);
});
test('campaign attribution survives internal navigation and excludes arbitrary fields', () => {
  const { captureCampaign } = projectModule('lib/seo/campaign-attribution.ts');
  assert.deepEqual(captureCampaign('?utm_source=google&gclid=example&email=private@example.com'), { utm_source: 'google', gclid: 'example' });
});
test('clicks and confirmed inquiries are distinct analytics events without contact data', () => {
  process.env.NEXT_PUBLIC_GTM_ID = 'GTM-TEST';
  process.env.NEXT_PUBLIC_META_PIXEL_ID = '';
  globalThis.window = { location: { pathname: '/contacto' }, dataLayer: [] };
  const { trackLead, trackPublicEvent } = projectModule('lib/marketing-analytics.ts');
  trackPublicEvent('click_whatsapp', { service: 'branding-e-identidad' });
  trackPublicEvent('click_email'); trackPublicEvent('click_phone');
  assert.equal(window.dataLayer.some(event => event.event === 'generate_lead'), false);
  trackLead({ email: 'private@example.com', service: 'branding-e-identidad', source: 'contact_form' });
  assert.equal(window.dataLayer.filter(event => event.event === 'generate_lead').length, 1);
  assert.equal(JSON.stringify(window.dataLayer).includes('private@example.com'), false);
  delete globalThis.window;
});
