// Explicit opt-in integration test. Never sends to the business inbox.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { projectModule } from './lib/load-project-module.mjs';
if (process.env.CONTACT_PROVIDER_TEST !== '1') {
  console.log('Skipped: set CONTACT_PROVIDER_TEST=1 to test Resend using delivered@resend.dev.');
  process.exit(0);
}
if (!process.env.RESEND_API_KEY || !(process.env.EMAIL_FROM || process.env.RESEND_FROM)) {
  console.log('Unavailable: RESEND_API_KEY and EMAIL_FROM or RESEND_FROM are required.');
  process.exit(1);
}
process.env.CONTACT_FORM_TO = 'delivered@resend.dev';
const filename = resolve('components/emails/ContactFormEmail.tsx');
const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
const emailModule = { exports: {} };
new Function('require', 'module', 'exports', compiled)(createRequire(filename), emailModule, emailModule.exports);
const { POST } = projectModule('app/contacto/enviar/route.ts', { '@/components/emails/ContactFormEmail': emailModule.exports });
const response = await POST(new Request('http://localhost/contacto/enviar', { method: 'POST', headers: { 'Content-Type': 'application/json', origin: 'http://localhost' }, body: JSON.stringify({ name: 'Prueba técnica Quepia', email: 'delivered@resend.dev', service: 'asesoramiento', message: 'Prueba de integración dirigida exclusivamente al buzón de prueba de Resend.', source: 'integration_test' }) }));
const result = await response.json();
console.log(JSON.stringify({ recipient: 'delivered@resend.dev', status: response.status, accepted: result.success === true && Boolean(result.id) }));
if (!response.ok || !result.success) process.exit(1);
