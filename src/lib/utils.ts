import { ethers } from 'ethers';
import { getDeployment } from '@orcaprotocol/contracts';
// These fetch the rinkeby deployments, but we just need the ABIs so it's irrelevant where we're fetching from.
import MemberToken from '@orcaprotocol/contracts/deployments/rinkeby/MemberToken.json';
import { getSafeSingletonDeployment } from '@gnosis.pm/safe-deployments';
import { config } from '../config';

// Mapping contractNames to JSONs
const contractJsons = {
  MemberToken,
};

const GnosisSafe = getSafeSingletonDeployment({ version: '1.3.0' });

/**
 * Returns ethers contract based on name
 * @param contractName
 * @param signer
 * @returns
 */
export function getContract(contractName: string, signer: ethers.Signer) {
  const contractJson = getDeployment(contractName, config.network);
  if (!contractJson) throw new RangeError(`Contract ABI could not be found for ${contractName}`);
  return new ethers.Contract(contractJson.address, contractJson.abi, signer);
}

/**
 * Checks to see if an address is valid (checksum or not)
 * @param address
 * @returns
 */
export function checkAddress(address: string) {
  try {
    return ethers.utils.getAddress(address);
  } catch {
    throw new TypeError(`Invalid address provided: ${address}`);
  }
}

/**
 * Handles ethers errors, as they have non-standard error formats.
 * @param error
 */
export const handleEthersError = error => {
  if (error.code === 'UNPREDICTABLE_GAS_LIMIT') {
    throw new Error(error.error.message);
  } else {
    throw new Error(error.message);
  }
};

/**
 * Given contracts that we support, returns the encoded function data
 * @param contractName Name of contract, i.e., "ERC20". You can also use "IERC20" when relevant
 * @param functionName Name of function as it appears on the ABI, i.e., 'transfer'
 * @param args Args of function in an array.
 * @returns
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function encodeFunctionData(contractName: string, functionName: string, args: Array<any>) {
  const contractJson = contractJsons[contractName];
  if (!contractJson) throw new RangeError(`Contract ABI could not be found for ${contractName}`);
  return new ethers.utils.Interface(contractJson.abi).encodeFunctionData(functionName, args);
}

/**
 * Signs a message using ethers wallet and a local private key.
 * @param contractTransactionHash - Generated safe's transaction hash in the format of 0x...
 * @param signer
 * @returns Signed message based on private key.
 */
export async function signMessage(contractTransactionHash: string, signer: ethers.Signer) {
  const signedMessage = await signer.signMessage(ethers.utils.arrayify(contractTransactionHash));
  // Reference: https://github.com/gnosis/safe-contracts/blob/main/src/utils/execution.ts#L102
  return signedMessage.replace(/1b$/, '1f').replace(/1c$/, '20');
}

/**
 * Gets the previous Controller module from the safe contract.
 * @param safe - Safe address
 * @param oldController - Old controller address
 * @param newController - New controller address
 * @param signer
 * @returns
 */
export async function getPreviousModule(
  safe: string,
  oldController: string,
  newController: string,
  signer: ethers.Signer,
): Promise<string> {
  const safeContract = new ethers.Contract(safe, GnosisSafe.abi, signer);
  const AddressOne = '0x0000000000000000000000000000000000000001';
  // TODO: figure out a better way to traverse the safes
  const safeModules = await safeContract.getModulesPaginated(AddressOne, 10);

  if (safeModules.includes(newController)) throw new Error('Pod is already on latest version');

  const oldIndex = safeModules.indexOf(oldController);
  const previousModule =
    safeModules.length === 1 || oldIndex === 0 ? newController : safeModules[oldIndex - 1];

  return previousModule;
}
