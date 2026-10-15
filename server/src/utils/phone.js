export const normalizePhone = (value = '') => value.replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');
