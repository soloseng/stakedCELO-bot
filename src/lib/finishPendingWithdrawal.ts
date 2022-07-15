import { LockedGoldWrapper } from "@celo/contractkit/lib/wrappers/LockedGold";
import { updateExecutionStatus } from "../helpers/db-helpers";
import { addKitAccount } from "../helpers/kit-helpers";

import accountContractData from "./alfajores_abi/accountAbi.json";

export async function finishPendingWithdrawals(kit: any, beneficiaryAddress: string) {
  try {
    const accountContract = new kit.web3.eth.Contract(
      accountContractData.abi,
      accountContractData.address
    );
    const lockedGoldWrapper = await kit.contracts.getLockedGold();

    const numberOfPendingWithdrawals = await accountContract.methods
      .getNumberPendingWithdrawals(beneficiaryAddress)
      .call();

    for (var i = 0; i < numberOfPendingWithdrawals; i++) {
      const { localIndex, lockedGoldIndex, localTimestamp } = await getPendingWithdrawalIndexes(
        accountContract,
        lockedGoldWrapper,
        beneficiaryAddress
      );

      console.log(`beneficiary: ${beneficiaryAddress}`);
      console.log(`localPendingWithdrawalIndex: ${localIndex}`);
      console.log(`lockedGoldPendingWithdrawalIndex: ${lockedGoldIndex}`);

      const signerAddress = addKitAccount(kit);

      const txObject = await accountContract.methods.finishPendingWithdrawal(
        beneficiaryAddress,
        localIndex,
        lockedGoldIndex
      );

      const tx = await kit.sendTransactionObject(txObject, { from: signerAddress });
      const receipt = await tx.waitReceipt();

      if (receipt.status) {
        await updateExecutionStatus(localTimestamp);
      }
    }
  } catch (error) {
    throw error;
  }
}

async function getPendingWithdrawalIndexes(
  accountContract: any,
  lockedGoldWrapper: LockedGoldWrapper,
  beneficiary: string
) {
  try {
    const localIndexPredicate = (timestamp: string) => {
      return Number(timestamp) < Date.now() / 1000;
    };

    const goldindexPredicate = (goldIndex: any) =>
      goldIndex.time.toString() == localTimestamp.toString();

    // get pending withdrawals
    const localPendingWithdrawals = await accountContract.methods
      .getPendingWithdrawals(beneficiary)
      .call();

    const lockedPendingWithdrawals = await lockedGoldWrapper.getPendingWithdrawals(
      accountContract.options.address
    );

    if (localPendingWithdrawals[0].length != localPendingWithdrawals[1].length) {
      throw new Error("mismatched list");
    }

    const localTimestampList: [] = localPendingWithdrawals[1];

    // find index for released funds
    const localIndex = localTimestampList.findIndex(localIndexPredicate);
    const localValue = localPendingWithdrawals[0][localIndex];
    const localTimestamp = localPendingWithdrawals[1][localIndex];

    // find lockedGold index where timestamps are equal
    var lockedGoldIndex = lockedPendingWithdrawals.findIndex(goldindexPredicate);

    // verify that values of at both indexes are equal.

    if (lockedPendingWithdrawals[lockedGoldIndex].value.toString() !== localValue.toString()) {
      throw new Error(`Withdrawal amounts do not match.`);
    }

    return { localIndex, lockedGoldIndex, localTimestamp };
  } catch (error) {
    throw error;
  }
}
