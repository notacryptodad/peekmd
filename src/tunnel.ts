/**
 * Cloudflare Quick Tunnel integration.
 * Spawns `cloudflared tunnel --url <localUrl>` and parses the public URL.
 */

import { spawn, type ChildProcess } from 'node:child_process';

export interface TunnelResult {
  url: string;
  process: ChildProcess;
  close: () => void;
}

/**
 * Start a Cloudflare Quick Tunnel pointing at the given local URL.
 * Returns the public URL once the tunnel is ready.
 * Requires `cloudflared` to be installed and in PATH.
 */
export function startTunnel(localUrl: string): Promise<TunnelResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('cloudflared', ['tunnel', '--url', localUrl], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        child.kill();
        reject(new Error('Tunnel timed out after 30s waiting for public URL'));
      }
    }, 30_000);

    const close = () => {
      child.kill();
      clearTimeout(timeout);
    };

    function parseLine(data: Buffer) {
      const line = data.toString();
      // cloudflared prints the URL in a line like:
      // +-------------------------------------------+
      // |  https://xxxx-xxxx.trycloudflare.com      |
      // +-------------------------------------------+
      // or: INF |  https://...
      const urlMatch = line.match(/(https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com)/);
      if (urlMatch && !resolved) {
        resolved = true;
        clearTimeout(timeout);
        resolve({ url: urlMatch[1], process: child, close });
      }
    }

    child.stdout?.on('data', parseLine);
    child.stderr?.on('data', parseLine);

    child.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          reject(
            new Error(
              'cloudflared not found. Install it: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/'
            )
          );
        } else {
          reject(err);
        }
      }
    });

    child.on('exit', (code) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        reject(new Error(`cloudflared exited with code ${code}`));
      }
    });
  });
}
