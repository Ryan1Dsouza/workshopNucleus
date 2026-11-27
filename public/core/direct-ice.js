// Strip legacy TURN entries and credentials before constructing a peer or publishing configuration.
export function stunServers(servers) {
  return servers.flatMap(server => {
    const urls = [server?.urls].flat().filter(url => typeof url === 'string' && /^stun:[^/?#@\s]+$/i.test(url));
    return urls.length ? [{urls}] : [];
  });
}

export function directCandidate(line) {
  return /^(?:a=)?candidate:\S+ \d+ udp \d+ \S+ \d+ typ (?:host|srflx|prflx)(?: |$)/i.test(line);
}

export function directDescription(description) {
  return {type:description.type, sdp:description.sdp.split(/\r?\n/).filter(line =>
    !/^a=candidate:/i.test(line) || directCandidate(line)
  ).join('\r\n')};
}
