import os from 'os';

export interface LocalNetworkInfo {
  ip: string;
  interfaceName: string;
  frontendUrl: string;
  backendUrl: string;
  pairingUrl: string;
}

/**
 * Dynamically detects the primary IPv4 network address of this host machine
 * prioritizing Wi-Fi, Ethernet, and non-virtual LAN adapters.
 */
export function getLocalNetworkAddress(
  frontendPort: number = 3000,
  backendPort: number = 4000,
): LocalNetworkInfo {
  const interfaces = os.networkInterfaces();
  let candidateIp: string | null = null;
  let candidateName = 'Unknown';

  // Sort interface names to check physical adapters first
  const names = Object.keys(interfaces);

  // 1. Look for Wi-Fi or Ethernet
  for (const name of names) {
    const addrs = interfaces[name];
    if (!addrs) continue;

    const lowerName = name.toLowerCase();
    const isVirtual =
      lowerName.includes('vethernet') ||
      lowerName.includes('wsl') ||
      lowerName.includes('virtual') ||
      lowerName.includes('hyper-v') ||
      lowerName.includes('pseudo') ||
      lowerName.includes('vmware') ||
      lowerName.includes('docker') ||
      lowerName.includes('tailscale');

    if (isVirtual) continue;

    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal) {
        const isLanIp =
          addr.address.startsWith('192.168.') ||
          addr.address.startsWith('10.') ||
          /^172\.(1[6-9]|2\d|3[0-1])\./.test(addr.address);

        if (isLanIp) {
          if (
            lowerName.includes('wi-fi') ||
            lowerName.includes('wifi') ||
            lowerName.includes('wireless') ||
            lowerName.includes('ethernet') ||
            lowerName.includes('wlan') ||
            lowerName.includes('en') ||
            lowerName.includes('eth')
          ) {
            return {
              ip: addr.address,
              interfaceName: name,
              frontendUrl: `http://${addr.address}:${frontendPort}`,
              backendUrl: `http://${addr.address}:${backendPort}`,
              pairingUrl: `http://${addr.address}:${frontendPort}/pair`,
            };
          }
          if (!candidateIp) {
            candidateIp = addr.address;
            candidateName = name;
          }
        }
      }
    }
  }

  const finalIp = candidateIp || '127.0.0.1';
  return {
    ip: finalIp,
    interfaceName: candidateName,
    frontendUrl: `http://${finalIp}:${frontendPort}`,
    backendUrl: `http://${finalIp}:${backendPort}`,
    pairingUrl: `http://${finalIp}:${frontendPort}/pair`,
  };
}

