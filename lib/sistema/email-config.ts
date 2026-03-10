const DEFAULT_EMAIL_FROM = 'Quepia <onboarding@resend.dev>'

export function getEmailFromAddress() {
  return process.env.EMAIL_FROM || process.env.RESEND_FROM || DEFAULT_EMAIL_FROM
}

export function isUsingDefaultResendSender() {
  return !process.env.EMAIL_FROM && !process.env.RESEND_FROM
}
