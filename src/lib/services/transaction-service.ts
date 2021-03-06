import axios from 'axios';
import { ethers, BigNumber } from 'ethers';
import { getSafeSingletonDeployment } from '@gnosis.pm/safe-deployments';
import type Proposal from '../../Proposal';
import { config } from '../../config';
import { lookupContractAbi } from './etherscan';
import { signMessage } from '../utils';

// used to checksum addresses
const { getAddress } = ethers.utils;

const GnosisSafe = getSafeSingletonDeployment({ version: process.env.GNOSIS_SAFE_VERSION });

// What is returned as a Transaction by the Gnosis Transaction Service
export interface SafeTransaction {
  safe: string;
  to: string;
  sender?: string;
  operation?: number;
  value?: string;
  data?: string;
  dataDecoded?: {
    method: string;
    parameters: Array<{
      name: string; // Name of parameter
      type: string; // Type, e.g., address, uint256
      value: string; // Actual value
    }>;
  };
  nonce?: number;
  safeTxGas?: number;
  safeTxHash?: string; // Generated transaction hash from safe contract
  transactionHash?: string; // Blockchain transaction hash
  baseGas?: number;
  confirmations?: Array<Confirmation>;
  confirmationsRequired?: number;
  gasPrice?: string;
  executionDate?: string;
  submissionDate?: string;
  blockNumber?: number;
  isExecuted?: boolean;
  isSuccessful?: boolean;
  origin?: string;
}

// Confirmation from transaction-service
export interface Confirmation {
  owner: string;
  submissionDate: string;
  transactionHash?: string;
  signature: string;
  signatureType: string;
}

export interface Safe {
  // Safe from getSafeInfo
  address: string;
  nonce: number;
  threshold: number;
  owners: string[];
  masterCopy: string;
  modules: string[];
  fallbackHandler: string;
  guard: string;
  version: string;
  // serialized fields
  isOrcaEnabled?: boolean;
  isPod?: boolean;
  hasToken?: boolean;
}

/**
 * Decodes transaction given an ABI and the data and parses it to match Gnosis's dataDecoded field
 * @param abi
 * @param data
 * @returns
 */
export function parseTransaction(
  abi,
  data: string,
): {
  method: string;
  parameters: Array<{
    name: string; // Name of parameter
    type: string; // Type, e.g., address, uint256
    value: string; // Actual value
  }>;
} {
  let name;
  let args;
  let inputs;
  try {
    ({
      name,
      args,
      functionFragment: { inputs },
    } = new ethers.utils.Interface(abi).parseTransaction({
      data,
    }));
  } catch {
    return null;
  }

  const parameters = inputs.map((input, index) => {
    let value = args[index];
    if (BigNumber.isBigNumber(value)) {
      value = value.toString();
    }
    return {
      name: input.name,
      type: input.type,
      value,
    };
  });
  return {
    method: name,
    parameters,
  };
}

/**
 * Populates the "dataDecoded" field of a transaction, if one does not exist.
 * @param transaction
 */
export async function populateDataDecoded(
  safeTransaction: SafeTransaction,
): Promise<SafeTransaction> {
  // No data to decode, or was already provided the decoded data
  if (
    safeTransaction.dataDecoded ||
    safeTransaction.data == null ||
    safeTransaction.data === ethers.constants.HashZero
  )
    return safeTransaction;

  const abi = await lookupContractAbi(safeTransaction.to);
  const dataDecoded = abi ? parseTransaction(abi, safeTransaction.data) : null;
  return { ...safeTransaction, dataDecoded };
}

/**
 * Gets safe info from transaction service.
 * The Nonce we get from this call is the current nonce, i.e., the nonce of the active proposal.
 *
 * @param address - Address of the Safe.
 * @returns - Safe data.
 */
export async function getSafeInfo(address: string): Promise<Safe> {
  // Transaction-service expects a checksum address, but graphql does not checksum its addresses
  const result = await axios.get(`${config.gnosisUrl}/safes/${getAddress(address)}`);
  return result.data;
}

/**
 * Gets the gas estimation for a given transaction.
 *
 * @param transaction - Transaction object.
 * @returns - Gas
 */
export async function getGasEstimation(transaction: SafeTransaction): Promise<number> {
  const url = `${config.gnosisUrl}/safes/${getAddress(
    transaction.safe,
  )}/multisig-transactions/estimations/`;
  const data = {
    to: getAddress(transaction.to),
    value: transaction.value || 0,
    data: transaction.data || ethers.constants.HashZero,
    operation: transaction.operation || 1,
  };
  const result = await axios.post(url, data);
  return result.data.safeTxGas;
}

/**
 * Asks the transaction service what the real transaction should be. Feeding an
 * incorrect transaction hash to the service has it spit back the real one.
 *
 * NOTE: This isn't really safe, we should look into asking the contract later.
 *
 * @param transaction - Transaction object that is missing a contractTransactionHash.
 * @returns - Safe transaction hash.
 */
export async function getSafeTxHash(transaction: SafeTransaction): Promise<string> {
  if (transaction.safeTxHash)
    throw new Error('Unexpected contractTransactionHash at getContractTransactionHash');

  let contractTransactionHash: string;
  const url = `${config.gnosisUrl}/safes/${getAddress(transaction.safe)}/multisig-transactions/`;

  try {
    // Sending the transaction service a made up transaction hash causes it to
    // send back an error with the actual transaction hash, so we'll do that and grab that.
    await axios.post(url, {
      contractTransactionHash: '0xd112233445566778899aabbccddff00000000000000000000000000000000000',
      signature:
        '0x000000000000000000000000a935484ba4250c446779d4703f1598dc2ea00d12000000000000000000000000000000000000000000000000000000000000000001',
      ...transaction,
    });
  } catch (err) {
    // result looks like:
    // 'Contract-transaction-hash=0x5ba491f67082bcc7de5c5a08b969668e0161ad8a402e0dd086d2493c5f28f7b7 does not match provided contract-tx-hash=0xd112233445566778899aabbccddff00000000000000000000000000000000000'
    // We're trying to grab that first one, that's the expected transaction hash
    const result = err.response.data.nonFieldErrors;
    [contractTransactionHash] = result[0].match(/0x\S+/);
  }

  if (!contractTransactionHash) {
    throw new Error('Failed to receive contractTransactionHash from transaction service');
  }

  return contractTransactionHash;
}

/**
 * Submits a new transaction to the transaction-service.
 *
 * @param {string} safeAddress - Address of Safe.
 * @param {Transaction} transaction - Transaction object received from populateTransaction.
 * @returns
 */
export async function submitSafeTransactionToService(
  transaction: SafeTransaction,
): Promise<SafeTransaction> {
  const url = `${config.gnosisUrl}/safes/${getAddress(transaction.safe)}/multisig-transactions/`;
  let result;
  try {
    result = await axios.post(url, {
      // Transaction Service names it contractTransactionHash only for this call
      contractTransactionHash: transaction.safeTxHash,
      ...transaction,
    });
  } catch (err) {
    throw new Error(err.response.data.nonFieldErrors);
  }
  return JSON.parse(result.config.data);
}

/**
 * Adds a confirmation/signature to an existing transaction (see submitTransactionToService).
 *
 * @param contractTransactionHash - ...
 * @param signedMessage - ...
 * @returns - Confirmed transaction.
 */
export async function addConfirmationToSafeTransaction(
  contractTransactionHash: string,
  signedMessage: string,
) {
  const url = `${config.gnosisUrl}/multisig-transactions/${contractTransactionHash}/confirmations/`;
  const response = await axios.post(url, { signature: signedMessage });
  return response.data;
}

/**
 * Gets transactions for a safe.
 *
 * @param address - Address of the Safe.
 * @param [params] - Query params.
 * @returns - Array of transactions for the Safe.
 */
export async function getSafeTransactionsBySafe(
  address: string,
  params?: Record<string, unknown>,
): Promise<SafeTransaction[]> {
  // Transaction-service expects a checksum address, but graphql does not checksum its addresses
  const result = await axios.get(
    `${config.gnosisUrl}/safes/${getAddress(address)}/multisig-transactions`,
    {
      params,
    },
  );
  return result.data.results;
}

/**
 * Gets a transaction from the transaction service.
 *
 * @param contractTransactionHash
 * @returns - Safe transaction object.
 */
export async function getSafeTransactionByHash(
  contractTransactionHash: string,
): Promise<SafeTransaction> {
  const url = `${config.gnosisUrl}/multisig-transactions/${contractTransactionHash}`;
  const result = await axios.get(url);
  return result.data;
}

/**
 * Approves transaction and submits approval to transaction-service
 * @param safeTransaction {SafeTransaction}
 * @param signer {ethers.Signer}
 */
export async function approveSafeTransaction(
  safeTransaction: SafeTransaction,
  signer: ethers.Signer,
) {
  const { safeTxHash } = safeTransaction;

  const signedHash = await signMessage(safeTxHash, signer);

  const confirmationInApprove = await addConfirmationToSafeTransaction(safeTxHash, signedHash);
  return confirmationInApprove;
}

/**
 * Creates a reject transaction on Gnosis
 * If provided a Signer, then this will auto-approve the tx.
 * @param safeTransaction
 * @param signerOrAddress - If provided a signer, it will approve. Address or signer must be safe owner.
 */
export async function createRejectTransaction(
  safeTransaction: SafeTransaction,
  signerOrAddress: ethers.Signer | string,
) {
  const signerAddress =
    typeof signerOrAddress === 'string' ? signerOrAddress : await signerOrAddress.getAddress();
  const data = {
    safe: safeTransaction.safe,
    to: safeTransaction.safe,
    value: '0',
    data: null,
    operation: 0,
    nonce: safeTransaction.nonce, // Same nonce
    sender: ethers.utils.getAddress(signerAddress), // Get the checksummed address
    confirmationsRequired: safeTransaction.confirmationsRequired,
    safeTxGas: 0,
    baseGas: 0,
    gasPrice: '0',
  };

  // The input doesn't have a contractTransactionHash,
  // We need to generate one from the transaction-service.
  const safeTxHash = await getSafeTxHash(data);

  const createdSafeTransaction = await submitSafeTransactionToService({ safeTxHash, ...data });
  // Approve only if it's a signer.
  if (typeof signerOrAddress !== 'string') {
    await approveSafeTransaction(createdSafeTransaction, signerOrAddress);
  }

  return createdSafeTransaction;
}

/**
 * Executes a transaction acquired from getSafeTransaction
 * @param safeTransaction
 * @returns
 */
export async function executeSafeTransaction(
  safeTransaction: SafeTransaction,
  signer: ethers.Signer,
) {
  // Refetch here to get all the confirmations.
  let refetched;
  try {
    refetched = await getSafeTransactionByHash(safeTransaction.safeTxHash);
  } catch (err) {
    throw new Error(`Error when fetching safe transaction from Gnosis: ${err}`);
  }
  // Format confirmations to something the smart contract will accept.
  const signatures = refetched.confirmations
    .sort((a, b) => (a.owner.toLowerCase() > b.owner.toLowerCase() ? 1 : -1))
    // eslint-disable-next-line
    .reduce((acc, cur) => (acc += cur.signature.replace('0x', '')), '0x');

  const safeContract = new ethers.Contract(safeTransaction.safe, GnosisSafe.abi, signer);
  return safeContract.execTransaction(
    refetched.to,
    refetched.value,
    refetched.data ? refetched.data : '0x',
    refetched.operation,
    refetched.safeTxGas,
    refetched.baseGas,
    Number(refetched.gasPrice),
    ethers.constants.AddressZero, // gasToken
    ethers.constants.AddressZero, // refundReceiver
    signatures,
    {
      gasLimit: 2000000,
    },
  );
}

/**
 * Executes a super proposal rejection
 * @param superProposalTxHash - Transaction hash of the original super proposal (not the reject super proposal)
 * @param subProposal - Proposal related to the superProposalTxHash
 * @param signer - Signer of sub proposal member
 */
export async function executeRejectSuperProposal(
  superProposalTxHash: string,
  subProposal: Proposal,
  signer: ethers.Signer,
) {
  const superProposal = await getSafeTransactionByHash(superProposalTxHash);
  const subPod = subProposal.pod;

  const [superPodTransactions, subPodTransactions] = await Promise.all([
    getSafeTransactionsBySafe(superProposal.safe, {
      nonce: superProposal.nonce,
    }),
    getSafeTransactionsBySafe(subPod.safe, {
      nonce: subProposal.id,
    }),
  ]);

  // The super reject, i.e., the standard gnosis reject that rejects the super proposal
  let superReject = superPodTransactions.find(
    safeTx => safeTx.data === null && safeTx.to === superProposal.safe,
  );
  if (!superReject) {
    superReject = await createRejectTransaction(superProposal, subProposal.pod.safe);
  }

  // The sub reject, i.e., the sub pod transaction that approves the super reject
  const subReject = subPodTransactions.find(
    safeTx =>
      safeTx?.dataDecoded?.method === 'approveHash' &&
      safeTx?.dataDecoded?.parameters[0].value === superReject.safeTxHash,
  );

  await executeSafeTransaction(subReject, signer);
}
