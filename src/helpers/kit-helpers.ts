const Web3 = require("web3");
import dotenv from "dotenv";
import { privateKeyToAddress } from "@celo/utils/lib/address";
import { ContractKit, newKit } from "@celo/contractkit";

import { ALFAJORES_HTTP_URL, ALFAJORES_WSS_URL } from "../staticVariables";
import { subscribeToEvents } from "./subscription-helpers";

dotenv.config();

export function setupProvider() {
  let providerOptions = {
    clientConfig: {
      // Useful to keep a connection alive
      keepalive: true,
      keepaliveInterval: 30000, // ms
    },

    // Enable auto reconnection
    reconnect: {
      auto: true,
      delay: 5000, // ms
      maxAttempts: false,
      onTimeout: false,
    },
  };
  const provider = new Web3.providers.WebsocketProvider(ALFAJORES_WSS_URL, providerOptions);
  let web3 = new Web3(provider);

  provider.on("connect", async (message: any) => {
    console.log("DEBUG: WebsocketProvider connected", message);
  });
  provider.on("close", async (error: any) => {
    console.log("DEBUG: WebsocketProvider connection closed. Restarting", error);
    // await setupNewProviderAndSubs();
  });
  provider.on("reconnect", async (attempts: any) => {
    console.log("DEBUG: WebsocketProvider reconnecting", attempts);
  });
  provider.on("error", async (error: any) => {
    console.log("DEBUG: WebsocketProvider encountered an error", error);
    // await setupNewProviderAndSubs()
  });
  provider.on("end", async () => {
    console.log("DEBUG: WebsocketProvider has ended, will restart");
    // await setupNewProviderAndSubs()
  });

  subscribeToEvents(web3);
}

export function addKitAccount(kit: ContractKit): string | undefined {
  if (process.env.PRIVATE_KEY !== undefined) {
    kit.connection.addAccount(process.env.PRIVATE_KEY);
    const signerAddress = privateKeyToAddress(process.env.PRIVATE_KEY);
    return signerAddress;
  }
  return undefined;
}

export function createKit(): ContractKit {
  return newKit(ALFAJORES_HTTP_URL);
}
export async function closeKitConnection(kit: ContractKit) {
  try {
    const isListenning = await kit.connection.isListening();
    if (isListenning) {
      kit.connection.stop();
    }
  } catch (error) {
    throw new Error(`Failed to close KIT connection: ${error}`);
  }
}
