const Web3 = require("web3");
import dotenv from "dotenv";
import { privateKeyToAddress } from "@celo/utils/lib/address";
import { ContractKit, newKit } from "@celo/contractkit";

import { ALFAJORES_HTTP_URL, ALFAJORES_WSS_URL } from "../staticVariables";
import { subscribeToEvents } from "./subscription-helpers";

dotenv.config();

export function setupProvider() {
  let providerOptions = {
    // timeout: 10 * 1000, // ms

    clientConfig: {
      // Useful if requests are large
      //   maxReceivedFrameSize: 100000000,   // bytes - default: 1MiB
      //   maxReceivedMessageSize: 100000000, // bytes - default: 8MiB

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
    console.log("WebsocketProvider connected", message);
  });
  provider.on("close", async (error: any) => {
    console.log("WebsocketProvider connection closed. Restarting", error);
    // await setupNewProviderAndSubs();
  });
  provider.on("reconnect", async (attempts: any) => {
    console.log("WebsocketProvider reconnecting", attempts);
  });
  provider.on("error", async (error: any) => {
    console.log("WebsocketProvider encountered an error", error);
    // await setupNewProviderAndSubs()
  });
  provider.on("end", async () => {
    console.log("WebsocketProvider has ended, will restart");
    // await setupNewProviderAndSubs()
  });

  subscribeToEvents(web3);
}

export function addKitAccount(kit: ContractKit): string | undefined {
  if (process.env.PRIVATE_KEY !== undefined) {
    kit.connection.addAccount(process.env.PRIVATE_KEY);
    // kit.web3.eth.account.wallet.add(process.env.PRIVATE_KEY);
    const signerAddress = privateKeyToAddress(process.env.PRIVATE_KEY);
    // console.log(signerAddress)
    return signerAddress;
  }
  return undefined;
}

export function createKit(): ContractKit {
  return newKit(ALFAJORES_HTTP_URL);
}
export async function closeKitConnection(kit: ContractKit) {
  const isListenning = await kit.connection.isListening();
  if (isListenning) {
    kit.connection.stop();
  }
}
