import { ethers } from 'ethers';
import { getDeployment, getControllerByAddress } from '@orcaprotocol/contracts';
import { getSafeSingletonDeployment } from '@gnosis.pm/safe-deployments';
import ENS, { getEnsAddress } from '@ensdomains/ensjs';
import { config } from './config';

const GnosisSafe = getSafeSingletonDeployment({ version: process.env.GNOSIS_SAFE_VERSION });

/**
 * Returns Controller, ENS Name and pod ID for a given pod address.
 * @param address Pod address
 */
export async function getPodFetchersByAddressOrEns(identifier: string): Promise<{
  podId: number;
  Safe: ethers.Contract;
  Controller: ethers.Contract;
  Name: ENS.Name;
}> {
  const { provider, network } = config;
  const ens = new ENS({ provider, ensAddress: getEnsAddress(network) });

  let address;
  // Name is the interface used to perform lookups on ENS
  let Name;
  try {
    // Handle addresses
    address = ethers.utils.getAddress(identifier);

    // `name` is the literal ens name.
    const { name } = await ens.getName(address);
    if (!name) throw new Error('Address did not have an ENS name');
    Name = ens.name(name);
  } catch (err) {
    // Might be ENS name instead of address
    // If so, resolve it. The getText below will throw if it's not a valid pod.
    Name = ens.name(identifier);
    address = await provider.resolveName(Name.name);
  }

  const podId = await Name.getText('podId');
  if (!podId) throw new Error('No podId on ENS found');

  // Member token tracks Controller for a given pod ID
  const memberTokenDeployment = getDeployment('MemberToken', network);
  const MemberToken = new ethers.Contract(
    memberTokenDeployment.address,
    memberTokenDeployment.abi,
    provider,
  );

  const controllerAddress = await MemberToken.memberController(podId);
  const controllerDeployment = getControllerByAddress(controllerAddress, network);
  const Controller = new ethers.Contract(
    controllerDeployment.address,
    controllerDeployment.abi,
    provider,
  );

  const Safe = new ethers.Contract(address, GnosisSafe.abi, provider);

  return {
    podId: parseInt(podId, 10),
    Controller,
    Name,
    Safe,
  };
}

/**
 * Returns Controller, ENS Name and pod ID for a given pod id
 * @param id - pod ID
 */
export async function getPodFetchersById(id: number): Promise<{
  podId: number;
  Safe: ethers.Contract;
  Controller: ethers.Contract;
  Name: ENS.Name;
}> {
  const { provider, network } = config;
  const ens = new ENS({ provider, ensAddress: getEnsAddress(network) }); // Member token tracks Controller for a given pod ID

  const memberTokenDeployment = getDeployment('MemberToken', network);
  const MemberToken = new ethers.Contract(
    memberTokenDeployment.address,
    memberTokenDeployment.abi,
    provider,
  );
  const controllerAddress = await MemberToken.memberController(id);
  if (controllerAddress === ethers.constants.AddressZero) {
    throw new Error('Pod ID was not registered on Controller');
  }

  const controllerDeployment = getControllerByAddress(controllerAddress, network);
  const Controller = new ethers.Contract(
    controllerDeployment.address,
    controllerDeployment.abi,
    provider,
  );

  const safe = await Controller.podIdToSafe(id);
  const { name } = await ens.getName(safe);
  if (!name) throw new Error('Address did not have an ENS name');
  const Name = ens.name(name);

  const Safe = new ethers.Contract(safe, GnosisSafe.abi, provider);

  return {
    podId: id,
    Safe,
    Controller,
    Name,
  };
}
