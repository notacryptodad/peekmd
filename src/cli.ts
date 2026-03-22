#!/usr/bin/env node

/**
 * peekmd CLI — self-hosted server with optional Cloudflare Tunnel.
 *
 * Usage:
 *   peekmd                      # Start on port 3000
 *   peekmd --port 8080          # Custom port
 *   peekmd --tunnel             # Start with Cloudflare Quick Tunnel
 *   peekmd --tunnel --port 8080 # Both
 */

import { buildApp } from './server.js';
import { MemoryStore } from './memory-store.js';
import { startTunnel } from './tunnel.js';

function parseArgs(args: string[]): { port: number; host: string; tunnel: boolean } {
  let port = 3000;
  let host = '0.0.0.0';
  let tunnel = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' || args[i] === '-p') {
      port = parseInt(args[i + 1], 10);
      if (isNaN(port) || port < 1 || port > 65535) {
        console.error('Invalid port number');
        process.exit(1);
      }
      i++;
    } else if (args[i] === '--host') {
      host = args[i + 1];
      i++;
    } else if (args[i] === '--tunnel' || args[i] === '-t') {
      tunnel = true;
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`peekmd — beautiful markdown, one link away

Usage: peekmd [options]

Options:
  --port, -p <port>   Port to listen on (default: 3000)
  --host <host>       Host to bind to (default: 0.0.0.0)
  --tunnel, -t        Start Cloudflare Quick Tunnel for public URL
  --help, -h          Show this help message

Environment variables:
  PORT                Port (overridden by --port)
  HOST                Host (overridden by --host)
  BASE_URL            Base URL for generated links`);
      process.exit(0);
    }
  }

  // Env var fallbacks
  if (!args.includes('--port') && !args.includes('-p') && process.env.PORT) {
    port = parseInt(process.env.PORT, 10);
  }
  if (!args.includes('--host') && process.env.HOST) {
    host = process.env.HOST;
  }

  return { port, host, tunnel };
}

async function main() {
  const { port, host, tunnel } = parseArgs(process.argv.slice(2));

  const store = new MemoryStore();
  store.startSweep();

  const localUrl = `http://localhost:${port}`;
  let baseUrl = process.env.BASE_URL ?? localUrl;

  // Start server first (without baseUrl if tunnel mode — we'll update it)
  const app = buildApp({ baseUrl, store });

  await new Promise<void>((resolve, reject) => {
    app.listen({ port, host }, (err, address) => {
      if (err) {
        reject(err);
        return;
      }
      console.log(`peekmd listening on ${address}`);
      resolve();
    });
  });

  if (tunnel) {
    console.log('Starting Cloudflare Quick Tunnel...');
    try {
      const result = await startTunnel(localUrl);
      console.log(`\nPublic URL: ${result.url}\n`);
      console.log('Pages will be accessible at:');
      console.log(`  ${result.url}/<slug>\n`);

      // Clean shutdown
      const cleanup = () => {
        console.log('\nShutting down...');
        result.close();
        app.close();
        process.exit(0);
      };
      process.on('SIGINT', cleanup);
      process.on('SIGTERM', cleanup);
    } catch (err) {
      console.error(`Tunnel failed: ${(err as Error).message}`);
      console.log('Server is still running locally.');
    }
  } else {
    const cleanup = () => {
      console.log('\nShutting down...');
      store.stopSweep();
      app.close();
      process.exit(0);
    };
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
