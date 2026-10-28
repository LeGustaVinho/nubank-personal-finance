import net from 'node:net';
import { spawn, execSync } from 'node:child_process';

const APP_SIGNATURE = 'financas-nubank-analytics';

/**
 * Checks if a port already has a listener on IPv4 (127.0.0.1) or IPv6 (::1)
 * OR if binding a server on 0.0.0.0 / :: fails.
 */
function canConnectToPort(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(400);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, host);
  });
}

function canBindPort(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => {
      resolve(false);
    });
    srv.once('listening', () => {
      srv.close(() => resolve(true));
    });
    srv.listen(port, host);
  });
}

export async function isPortCompletelyFree(port: number): Promise<boolean> {
  // 1. Check if anything accepts connections on IPv4 or IPv6 loopback
  const occupiedV4 = await canConnectToPort(port, '127.0.0.1');
  if (occupiedV4) return false;

  const occupiedV6 = await canConnectToPort(port, '::1');
  if (occupiedV6) return false;

  // 2. Verify we can bind on both 127.0.0.1 and 0.0.0.0
  const bindV4 = await canBindPort(port, '127.0.0.1');
  if (!bindV4) return false;

  const bindAll = await canBindPort(port, '0.0.0.0');
  if (!bindAll) return false;

  return true;
}

/**
 * Checks if a given port is running THIS specific application (`financas-nubank-analytics`)
 */
export async function isOurAppRunningOnPort(port: number): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 800);
    const res = await fetch(`http://localhost:${port}/api/health`, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return false;
    const data = (await res.json()) as { app?: string; status?: string };
    return data?.app === APP_SIGNATURE && data?.status === 'ok';
  } catch {
    return false;
  }
}

export async function findFreePort(
  startPort: number,
  maxAttempts = 30,
  label = 'Servidor'
): Promise<number> {
  for (let i = 0; i < maxAttempts; i++) {
    const candidate = startPort + i;
    const free = await isPortCompletelyFree(candidate);
    if (free) {
      if (i > 0) {
        console.log(
          `[PORTA DINÂMICA] ${label}: porta padrão ${startPort} ocupada -> alocada porta livre ${candidate}`
        );
      }
      return candidate;
    } else {
      console.log(
        `[AVISO] ${label}: porta ${candidate} já está em uso por outro processo/servidor.`
      );
    }
  }
  throw new Error(`Não foi possível encontrar porta livre a partir de ${startPort}`);
}

function openBrowser(url: string) {
  try {
    if (process.platform === 'win32') {
      spawn('cmd.exe', ['/c', 'start', '""', url], {
        detached: true,
        stdio: 'ignore',
      }).unref();
    } else if (process.platform === 'darwin') {
      spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    } else {
      spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
    }
  } catch (err) {
    console.error('Erro ao abrir navegador automaticamente:', err);
  }
}

async function waitForOurAppReady(webPort: number, timeoutMs = 20000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ok = await isOurAppRunningOnPort(webPort);
    if (ok) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

async function main() {
  console.log('==============================================================');
  console.log('  FINANÇAS & CONTROLE DE GASTOS — LAUNCHER INTELIGENTE');
  console.log('==============================================================\n');

  // 1. Force production build before starting
  console.log('[1/4] Executando build forçado (npm run build)...');
  try {
    execSync('npm run build', { stdio: 'inherit' });
    console.log('[OK] Build concluído com sucesso!\n');
  } catch (err) {
    console.error('[ERRO] Falha durante o build do projeto.');
    process.exit(1);
  }

  // 2. Check if our own app is already running on 5173..5185
  console.log('[2/4] Verificando portas e servidores ativos...');
  for (let p = 5173; p <= 5185; p++) {
    const isOurs = await isOurAppRunningOnPort(p);
    if (isOurs) {
      const url = `http://localhost:${p}`;
      console.log(`[OK] Finanças & Controle de Gastos já está ativo em ${url}!`);
      console.log(`[3/4] Abrindo navegador em ${url}...`);
      openBrowser(url);
      return;
    }
  }

  // 3. Dynamically allocate free ports for Backend API and Frontend Web
  const apiPort = await findFreePort(3001, 30, 'Backend API');
  const webPort = await findFreePort(5173, 30, 'Interface Web (Vite)');

  const env = {
    ...process.env,
    API_PORT: String(apiPort),
    WEB_PORT: String(webPort),
  };

  console.log(
    `\n[3/4] Iniciando Backend na porta ${apiPort} e Interface Web na porta ${webPort}...`
  );

  const isWin = process.platform === 'win32';
  const npxCmd = isWin ? 'npx.cmd' : 'npx';

  const apiProc = spawn(npxCmd, ['tsx', 'watch', 'server/index.ts'], {
    env,
    stdio: 'inherit',
    shell: isWin,
  });

  const webProc = spawn(
    npxCmd,
    ['vite', '--port', String(webPort), '--strictPort'],
    {
      env,
      stdio: 'inherit',
      shell: isWin,
    }
  );

  const cleanup = () => {
    try {
      apiProc.kill();
    } catch {}
    try {
      webProc.kill();
    } catch {}
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  // 4. Wait until our app's /api/health responds through the Vite proxy on webPort, then open browser
  const ready = await waitForOurAppReady(webPort, 25000);
  const targetUrl = `http://localhost:${webPort}`;

  if (ready) {
    console.log(`\n[4/4] Tudo pronto! Abrindo navegador em ${targetUrl} ...`);
    openBrowser(targetUrl);
  } else {
    console.log(
      `\n[AVISO] Servidor iniciado. Acesse manualmente em: ${targetUrl}`
    );
    openBrowser(targetUrl);
  }
}

if (process.env.NODE_ENV !== 'test') {
  main().catch((err) => {
    console.error('Erro fatal no inicializador:', err);
    process.exit(1);
  });
}
