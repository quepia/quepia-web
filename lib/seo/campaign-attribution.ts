// Attribution is kept separate from analytics payloads and never includes contact fields.
export const campaignKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_id', 'utm_term', 'utm_content', 'gclid', 'gbraid', 'wbraid'] as const;
export function captureCampaign(search: string): Record<string, string> {
  const params = new URLSearchParams(search);
  return Object.fromEntries(campaignKeys.flatMap(key => {
    const value = params.get(key);
    return value ? [[key, value.slice(0, 200)]] : [];
  }));
}
export function readCampaign(): Record<string, string> {
  try { return captureCampaign(new URLSearchParams(JSON.parse(sessionStorage.getItem('quepia-campaign') || '{}')).toString()); }
  catch { return {}; }
}
