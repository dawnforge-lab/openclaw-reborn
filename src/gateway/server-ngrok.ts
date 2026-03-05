import ngrok from "@ngrok/ngrok";
import type { GatewayNgrokConfig } from "../config/types.gateway.js";

let listener: ngrok.Listener | null = null;

export async function startGatewayNgrokTunnel(params: {
  ngrokConfig: GatewayNgrokConfig;
  port: number;
  controlUiBasePath?: string;
  logNgrok: { info: (msg: string) => void; warn: (msg: string) => void };
}): Promise<(() => Promise<void>) | null> {
  if (!params.ngrokConfig.enabled) {
    return null;
  }

  const authtoken = params.ngrokConfig.authtoken || process.env.NGROK_AUTHTOKEN;
  if (!authtoken) {
    params.logNgrok.warn("ngrok enabled but no authtoken configured (set gateway.ngrok.authtoken or NGROK_AUTHTOKEN)");
    return null;
  }

  try {
    const opts: ngrok.Config = {
      addr: params.port,
      authtoken,
    };

    if (params.ngrokConfig.domain) {
      opts.domain = params.ngrokConfig.domain;
    }

    listener = await ngrok.forward(opts);
    const url = listener.url();
    if (url) {
      const uiPath = params.controlUiBasePath ? `${params.controlUiBasePath}/` : "/";
      params.logNgrok.info(`ngrok tunnel active: ${url}${uiPath} (WS via ${url.replace("https://", "wss://")})`);
    } else {
      params.logNgrok.info("ngrok tunnel active");
    }
  } catch (err) {
    params.logNgrok.warn(`ngrok tunnel failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }

  return async () => {
    if (listener) {
      try {
        await listener.close();
      } catch {
        // Tunnel may already be closed
      }
      listener = null;
    }
  };
}

export function getNgrokUrl(): string | null {
  return listener?.url() ?? null;
}
