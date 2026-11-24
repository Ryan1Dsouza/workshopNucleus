export function downloadOrigins(info, location) {
  if (!['localhost','127.0.0.1','[::1]'].includes(location.hostname)) return [location.origin];
  const addresses = [...new Set((info.addresses || []).filter(address => {
    if (typeof address !== 'string' || !/^[0-9.]+$/.test(address)) return false;
    const parts=address.split('.');
    return parts.length===4 && parts.every(part=>part!==''&&Number(part)<=255) && !address.startsWith('127.') && !address.startsWith('169.254.') && address!=='0.0.0.0';
  }))];
  return addresses.length ? addresses.map(address=>'http://'+address+':'+info.port) : [location.origin];
}
