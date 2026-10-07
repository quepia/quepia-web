export const CONTACT_PHONE = '+5493517186433';
export const CONTACT_PHONE_DISPLAY = '+54 9 351 718-6433';
export const CONTACT_PHONE_URL = `tel:${CONTACT_PHONE}`;
export const CONTACT_WHATSAPP_URL = `https://wa.me/${CONTACT_PHONE.slice(1)}`;

export const whatsappUrl = (service = 'mi proyecto') => `${CONTACT_WHATSAPP_URL}?text=${encodeURIComponent(`Hola Quepia, quiero consultar por ${service}`)}`;
