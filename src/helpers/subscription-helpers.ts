import {
  ALFAJORES_ST_CELO_ADDRESS,
  ALFAJORES_ST_CELO_BURN_EVENT,
  ALFAJORES_ST_CELO_BURN_ADDRESS,
  ALFAJORES_LAUNCH_BLOCK,
  CHECK_INTERVAL,
  ALFAJORES_LOCKED_GOLD_CONTRACT_ADDRESS,
} from "../staticVariables";
import { withdraw } from "../lib/withdraw";
import { closeKitConnection, createKit } from "./kit-helpers";
import { finishPendingWithdrawals } from "../lib/finishPendingWithdrawal";
import { addPendingWithdrawal, compareTimestamp, createDatabase } from "./db-helpers";

/// listen for stCELO burn events.
// When an event is emmited, start the withdrawal process using `Account.withdraw`.
// Once we receive receipt of the transaction, use the event logs to store data to the db.
function stakedCeloBurnEventSubscription(web3: any) {
  let subscriptionOptions = {
    fromBlock: ALFAJORES_LAUNCH_BLOCK,
    address: [ALFAJORES_ST_CELO_ADDRESS], //Only get events from specific addresses
    topics: [ALFAJORES_ST_CELO_BURN_EVENT, null, ALFAJORES_ST_CELO_BURN_ADDRESS], // only listen for burn events                           //What topics to subscribe to
  };

  let burnEventSubscription = web3.eth.subscribe(
    "logs",
    subscriptionOptions,
    (err: any, event: any) => {
      // if (!err)
      //     console.log("new burn event:", event)
    }
  );

  burnEventSubscription.on("data", async (burnEvent: any) => {
    const decodedLogs = web3.eth.abi.decodeLog(
      [
        {
          indexed: true,
          name: "from",
          type: "address",
        },
        {
          indexed: true,
          name: "to",
          type: "address",
        },
        {
          indexed: false,
          name: "value",
          type: "uint256",
        },
      ],
      burnEvent["data"],
      [burnEvent["topics"][1], burnEvent["topics"][2]]
    );

    withdrawFromAccountOnBurnEvent(decodedLogs);
  });

  burnEventSubscription.on("error", (err: any) => {
    throw err;
  });
}
// listen for gold unlock events.
// only used for debugging.
function goldUnlockedEventSubscription(web3: any) {
  let goldUnlockSubscriptionOptions = {
    fromBlock: ALFAJORES_LAUNCH_BLOCK,
    address: [ALFAJORES_LOCKED_GOLD_CONTRACT_ADDRESS], //Only get events from specific addresses
    topics: ["0xb1a3aef2a332070da206ad1868a5e327f5aa5144e00e9a7b40717c153158a588"], //What topics to subscribe to
  };

  let goldUnlockSubscription = web3.eth.subscribe(
    "logs",
    goldUnlockSubscriptionOptions,
    (err: any, event: any) => {
      //   if (!err) console.log("new gold unlock event:", event);
    }
  );

  goldUnlockSubscription.on("data", async function (data: any) {
    const decodedLogs = web3.eth.abi.decodeLog(
      [
        {
          indexed: true,
          name: "account",
          type: "address",
        },
        {
          indexed: false,
          name: "value",
          type: "uint256",
        },
        {
          indexed: false,
          name: "available",
          type: "uint256",
        },
      ],
      data["data"],
      [data["topics"][1]]
    );

    console.log("timestamp", decodedLogs.available);

    // add to db
    await addPendingWithdrawal(
      "0x5bC1C4C1D67C5E4384189302BC653A611568a788",
      decodedLogs.value,
      decodedLogs.available,
      "0x5edfce0bad47e24e30625c275457f5b4bb619241"
    );
  });
}

// Listen for every new block created
// can use this to periodically check if withdrawal timelock has passed.
// if passed, finish pending withdrawal for every unique user
function newBlockEventSubscription(web3: any) {
  console.log("subscribing to new block events");
  let headerSubscription = web3.eth.subscribe("newBlockHeaders");

  let executionBlock: number = 0;
  headerSubscription.on("data", async function (blockHeader: any) {
    const lastSeenBlock = blockHeader.number;
    const lastSeenBlockTimestamp = blockHeader.timestamp;
    console.log("execution block:", executionBlock);
    console.log("latest block:", lastSeenBlock);
    console.log("latest block timestamp:", lastSeenBlockTimestamp);

    if (executionBlock < lastSeenBlock) {
      executionBlock = lastSeenBlock + CHECK_INTERVAL;

      console.log("comparing timestamp with db");
      const beneficiariesList = await compareTimestamp(lastSeenBlockTimestamp);

      for (var beneficiary of beneficiariesList) {
        finishPendingWithdrawalOnTimeElapsed(beneficiary["user_address"]);
      }
    }
  });
}

export async function subscribeToEvents(web3: any) {
  try {
    await createDatabase();
    newBlockEventSubscription(web3);
    stakedCeloBurnEventSubscription(web3);
    // goldUnlockedEventSubscription(web3);
  } catch (error) {
    console.log("Failed to subscribe to events:", error);
  }
}

async function withdrawFromAccountOnBurnEvent(decodedLogs: any) {
  try {
    const kit = createKit();

    await withdraw(kit, decodedLogs.from);

    await closeKitConnection(kit);
  } catch (error) {
    console.log(error);
  }
}
async function finishPendingWithdrawalOnTimeElapsed(beneficiaryAddress: string) {
  try {
    const kit = createKit();

    await finishPendingWithdrawals(kit, beneficiaryAddress);

    await closeKitConnection(kit);
  } catch (error) {
    console.log(error);
  }
}
