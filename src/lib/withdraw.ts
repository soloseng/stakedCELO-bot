import { ElectionWrapper } from "@celo/contractkit/lib/wrappers/Election";

import accountContractData from "./alfajores_abi/accountAbi.json";
import managerContractData from "./alfajores_abi/managerAbi.json";
import { ALFAJORES_LOCKED_GOLD_CONTRACT_ADDRESS } from "../staticVariables";
import { addPendingWithdrawal } from "../helpers/db-helpers";
import { addKitAccount } from "../helpers/kit-helpers";

export async function withdraw(kit: any, beneficiaryAddress: string) {
  try {
    const electionWrapper = await kit.contracts.getElection();
    const accountContract = new kit.web3.eth.Contract(
      accountContractData.abi,
      accountContractData.address
    );
    const managerContract = new kit.web3.eth.Contract(
      managerContractData.abi,
      managerContractData.address
    );

    // Use deprecated and active groups to get a list of groups with potential withdrawals.
    const deprecatedGroups: [] = await managerContract.methods.getDeprecatedGroups().call();
    const activeGroups: [] = await managerContract.methods.getGroups().call();
    const groupList = deprecatedGroups.concat(activeGroups);

    for (var group of groupList) {
      // check what the beneficiary withdrawal amount is for each group.
      const scheduledWithdrawalAmount = await accountContract.methods
        .scheduledWithdrawalsForGroupAndBeneficiary(group, beneficiaryAddress)
        .call();

      if (scheduledWithdrawalAmount > 0) {
        // substract the immediateWithdrawalAmount from scheduledWithdrawalAmount to get the revokable amount
        const immediateWithdrawalAmount = await accountContract.methods
          .scheduledVotesForGroup(group)
          .call();
        console.log("DEBUG: immediateWithdrawalAmount:", immediateWithdrawalAmount);

        const revokeAmount = scheduledWithdrawalAmount - immediateWithdrawalAmount;
        console.log("DEBUG: revokeAmount:", revokeAmount);

        // get AccountContract pending votes for group.
        const groupVote = await electionWrapper.getVotesForGroupByAccount(
          accountContract.options.address,
          group
        );
        const pendingVotes = groupVote.pending;

        console.log("DEBUG: pendingVotes:", pendingVotes);

        // amount to revoke from pending
        const toRevokeFromPending = Math.min(revokeAmount, pendingVotes.toNumber());

        console.log("DEBUG: toRevokeFromPending:", toRevokeFromPending);

        // find lesser and greater for pending votes
        // @ts-ignore
        const lesserAndGreaterAfterPendingRevoke =
          await electionWrapper.findLesserAndGreaterAfterVote(
            group,
            (toRevokeFromPending * -1).toString()
          );
        const lesserAfterPendingRevoke = lesserAndGreaterAfterPendingRevoke.lesser;
        const greaterAfterPendingRevoke = lesserAndGreaterAfterPendingRevoke.greater;

        // find amount to revoke from active votes
        const toRevokeFromActive = revokeAmount - toRevokeFromPending;

        console.log("DEBUG: toRevokeFromActive:", toRevokeFromActive);

        // find lesser and greater for active votes
        // @ts-ignore
        const lesserAndGreaterAfterActiveRevoke =
          await electionWrapper.findLesserAndGreaterAfterVote(
            group,
            (toRevokeFromActive * -1).toString()
          );
        const lesserAfterActiveRevoke = lesserAndGreaterAfterActiveRevoke.lesser;
        const greaterAfterActiveRevoke = lesserAndGreaterAfterActiveRevoke.greater;

        // find index of group
        const index = await findAddressIndex(
          electionWrapper,
          group,
          accountContract.options.address
        );

        console.log("DEBUG: Finalizing:");
        console.log("DEBUG: beneficiaryAddress:", beneficiaryAddress);
        console.log("DEBUG: group:", group);
        console.log("DEBUG: lesserAfterPendingRevoke:", lesserAfterPendingRevoke);
        console.log("DEBUG: greaterAfterPendingRevoke:", greaterAfterPendingRevoke);
        console.log("DEBUG: lesserAfterActiveRevoke:", lesserAfterActiveRevoke);
        console.log("DEBUG: greaterAfterActiveRevoke:", greaterAfterActiveRevoke);
        console.log("DEBUG: index:", index);

        const signerAddress = addKitAccount(kit);

        const txObject = await accountContract.methods.withdraw(
          beneficiaryAddress,
          group,
          lesserAfterPendingRevoke,
          greaterAfterPendingRevoke,
          lesserAfterActiveRevoke,
          greaterAfterActiveRevoke,
          index
        );

        const tx = await kit.sendTransactionObject(txObject, { from: signerAddress });

        const receipt = await tx.waitReceipt();

        const unlockEvent: any = Object.values(receipt.events).filter((section: any) => {
          return section.address == ALFAJORES_LOCKED_GOLD_CONTRACT_ADDRESS;
        });
        console.log("DEBUG: eventz:", receipt.events);
        console.log("DEBUG: unlockEvent:", unlockEvent, unlockEvent.length);
        if (unlockEvent !== undefined && unlockEvent.length > 0) {
          const decodedLogs = kit.web3.eth.abi.decodeLog(
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
            unlockEvent[0]["raw"]["data"],
            [unlockEvent[0]["raw"]["topics"][1]]
          );

          // add to db
          await addPendingWithdrawal(
            beneficiaryAddress,
            decodedLogs.value,
            decodedLogs.available,
            group
          );
        }
      }
    }
  } catch (error) {
    throw new Error(`Failed to initiate withdrawal: ${error}`);
  }
}

// find index of group in list of groups voted for by account.
async function findAddressIndex(
  electionWrapper: ElectionWrapper,
  group: string,
  account: string
): Promise<number> {
  try {
    const list = await electionWrapper.getGroupsVotedForByAccount(account);
    return list.indexOf(group);
  } catch (error) {
    throw error;
  }
}
