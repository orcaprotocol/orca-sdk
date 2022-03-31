import { ethers } from 'ethers';
import axios from 'axios';
import ENS from '@ensdomains/ensjs';
import { getControllerByAddress, getDeployment } from '@orcaprotocol/contracts';
import { config } from './config';
import { getPodFetchersByAddressOrEns, getPodFetchersById } from './fetchers';
import {
  getContract,
  handleEthersError,
  encodeFunctionData,
  checkAddress,
  getPreviousModule,
} from './lib/utils';
import { createSafeTransaction } from './lib/services/transaction-service';

export default class Pod {
  /**
   *
   * @param identifier Can be either podId or safe address
   * @returns
   */
  constructor(identifier: string | number) {
    const { network } = config;
    // This is a kind of hacky way to go about an async constructor.
    // It works, typescript just doesn't like it.
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    return (async () => {
      let podId: number;
      let safe: string;
      let Controller: ethers.Contract;
      let Name: ENS.Name;
      try {
        let fetchers;
        if (typeof identifier === 'string') {
          fetchers = await getPodFetchersByAddressOrEns(identifier);
        } else if (typeof identifier === 'number') {
          fetchers = await getPodFetchersById(identifier);
        }
        podId = fetchers.podId;
        safe = fetchers.safe;
        Controller = fetchers.Controller;
        Name = fetchers.Name;
      } catch (err) {
        if (err.message.includes('invalid address')) {
          throw new TypeError(`Non-address string passed to Pod constructor: '${identifier}'`);
        }
        return null;
      }

      const fetchedAdmin = await Controller.podAdmin(podId);
      this.controller = Controller.address;
      this.admin = fetchedAdmin === ethers.constants.AddressZero ? null : fetchedAdmin;
      this.id = podId;
      this.safe = safe;
      this.ensName = Name.name;

      const baseUrl = `https://orcaprotocol-nft.vercel.app${
        network === 4 ? '/assets/testnet/' : '/assets/'
      }`;
      const imageUrl = `${baseUrl}${podId.toString(16).padStart(64, '0')}-image`;
      const imageNoTextUrl = `${baseUrl}${podId.toString(16).padStart(64, '0')}-image-no-text`;

      this.imageUrl = imageUrl;
      this.imageNoTextUrl = imageNoTextUrl;
      return this;
    })();
  }

  // Address of Controller
  controller: string;

  id: number;

  safe: string;

  ensName: string;

  admin: string;

  imageUrl: string;

  imageNoTextUrl: string;

  members?: string[];

  memberEOAs?: string[];

  memberPods?: Pod[];

  /* Member fetch functions */

  /**
   * Returns of list of all member addresses.
   * @returns string[]
   */
  getMembers = async (): Promise<string[]> => {
    const { subgraphUrl } = config;
    if (this.members) return this.members;
    const { data } = await axios.post(subgraphUrl, {
      query: `query GetPodUsers($id: ID!) {
            pod(id: $id) {
              users {
                user {
                  id
                }
              }
            }
          }`,
      variables: { id: this.id },
    });
    const { users } = data.data.pod || { users: [] };
    this.members = users.length > 0 ? users.map(user => ethers.utils.getAddress(user.user.id)) : [];
    return this.members;
  };

  /**
   * Populates the memberEOAs and memberPods fields.
   * The process for fetching either of these fields is the same.
   */
  async populateMembers() {
    if (!this.members) await this.getMembers();

    const EOAs = [];
    const memberPods = (
      await Promise.all(
        this.members.map(async member => {
          const pod = await new Pod(member);
          // If pod is null, it's an EOA.
          if (!pod) {
            EOAs.push(member);
            return pod;
          }
          return pod;
        }),
      )
    ).filter(x => !!x); // Filter null values from memberPods.

    this.memberEOAs = EOAs;
    this.memberPods = memberPods;
  }

  /**
   * Returns list of all member EOAs, not including any smart contract/pod members.
   * @returns
   */
  getMemberEOAs = async (): Promise<string[]> => {
    if (this.memberEOAs) return this.memberEOAs;
    await this.populateMembers();
    return this.memberEOAs;
  };

  /**
   * Returns Pod objects of all member pods.
   * @returns Pod[]
   */
  getMemberPods = async (): Promise<Pod[]> => {
    if (this.memberPods) return this.memberPods;
    await this.populateMembers();
    return this.memberPods;
  };

  /* Member check functions */

  isMember = async (address: string): Promise<boolean> => {
    checkAddress(address);
    if (!this.members) await this.getMembers();
    return this.members.includes(address);
  };

  isAdmin = (address: string): boolean => {
    checkAddress(address);
    return address === this.admin;
  };

  /**
   * Checks if given address is a member of any subpods.
   * This includes EOAs and other pods (or smart contracts).
   * @param address
   * @returns
   */
  isSubPodMember = async (address: string): Promise<boolean> => {
    checkAddress(address);
    if (!this.memberPods) await this.populateMembers();
    const results = await Promise.all(
      this.memberPods.map(async pod => {
        const members = await pod.getMembers();
        return members.includes(address);
      }),
    );
    return results.includes(true);
  };

  /* Mint functions */

  /**
   * Checks if the user is the admin of the pod, and then mints a member.
   */
  mintMember = async (
    newMember: string,
    signer: ethers.Signer,
  ): Promise<ethers.providers.TransactionResponse> => {
    checkAddress(newMember);
    try {
      return getContract('MemberToken', signer).mint(newMember, this.id, ethers.constants.HashZero);
    } catch (err) {
      return handleEthersError(err);
    }
  };

  /**
   * Any member of a pod can call this
   */
  proposeMintMember = async (newMember: string, signer: ethers.Signer) => {
    checkAddress(newMember);
    if (await this.isMember(newMember)) {
      throw new Error(`Address ${newMember} is already in this pod`);
    }

    const data = encodeFunctionData('MemberToken', 'mint', [
      ethers.utils.getAddress(newMember),
      this.id,
      ethers.constants.HashZero,
    ]);

    const { address: memberTokenAddress } = getContract('MemberToken', signer);
    const memberAddress = await signer.getAddress();
    try {
      await createSafeTransaction(
        {
          sender: memberAddress,
          safe: this.safe,
          to: memberTokenAddress,
          data,
        },
        signer,
      );
    } catch (err) {
      throw new Error(err);
    }
  };

  /**
   * Creates a proposal on an external pod to mint a new member to this pod.
   * @param externalPodIdentifier - The Pod object, pod ID or pod safe address of either the admin pod, or a subpod of this pod.
   * @param newMember - Member to mint
   * @param signer -
   */
  proposeMintMemberFromPod = async (
    externalPodIdentifier: Pod | string | number,
    newMember: string,
    signer: ethers.Signer,
  ) => {
    if (await this.isMember(newMember)) {
      throw new Error(`Address ${newMember} is already in this pod`);
    }

    let externalPod: Pod;
    if (externalPodIdentifier instanceof Pod) externalPod = externalPodIdentifier;
    else {
      externalPod = await new Pod(externalPodIdentifier);
    }
    if (!externalPod)
      throw new Error(`Could not find a pod with identifier ${externalPodIdentifier}`);

    // External pod must be the admin or a subpod of this pod.
    if (!(this.isAdmin(externalPod.safe) || (await this.isMember(externalPod.safe)))) {
      throw new Error(
        `Pod ${externalPod.safe} must be the admin or a subpod of this pod to make proposals`,
      );
    }

    const signerAddress = await signer.getAddress();
    if (!(await externalPod.isMember(signerAddress)))
      throw new Error(`Signer ${signerAddress} was not a member of the external pod`);

    // Tells MemberToken to mint a new token for this pod to newMember.
    const data = encodeFunctionData('MemberToken', 'mint', [
      ethers.utils.getAddress(newMember),
      this.id,
      ethers.constants.HashZero,
    ]);

    const { address: memberTokenAddress } = getContract('MemberToken', signer);
    try {
      // Create a safe transaction on this pod, sent from the admin pod
      await createSafeTransaction(
        {
          sender: externalPod.safe,
          safe: this.safe,
          to: memberTokenAddress,
          data,
        },
        signer,
      );
    } catch (err) {
      throw new Error(err);
    }
  };

  /* Burn functions */

  /**
   * Checks if the user is the admin of the pod, and then burns a member.
   */
  burnMember = async (
    memberToBurn: string,
    signer: ethers.Signer,
  ): Promise<ethers.providers.TransactionResponse> => {
    checkAddress(memberToBurn);
    try {
      return getContract('MemberToken', signer).burn(memberToBurn, this.id);
    } catch (err) {
      return handleEthersError(err);
    }
  };

  /**
   * Any member of a pod can call this
   */
  proposeBurnMember = async (memberToBurn: string, signer: ethers.Signer) => {
    checkAddress(memberToBurn);
    if (!(await this.isMember(memberToBurn))) {
      throw new Error(`Address ${memberToBurn} is not in this pod`);
    }

    const data = encodeFunctionData('MemberToken', 'burn', [
      ethers.utils.getAddress(memberToBurn),
      this.id,
    ]);

    const { address: memberTokenAddress } = getContract('MemberToken', signer);
    const memberAddress = await signer.getAddress();

    try {
      await createSafeTransaction(
        {
          sender: memberAddress,
          safe: this.safe,
          to: memberTokenAddress,
          data,
        },
        signer,
      );
    } catch (err) {
      throw new Error(err);
    }
  };

  /**
   * Creates a proposal on an external pod to burn a new member from this pod.
   * @param externalPodIdentifier - The Pod object, pod ID or pod safe address of either the admin pod, or a subpod of this pod.
   * @param memberToBurn - Member to mint
   * @param signer -
   */
  proposeBurnMemberFromPod = async (
    externalPodIdentifier: Pod | string | number,
    memberToBurn: string,
    signer: ethers.Signer,
  ) => {
    if (!(await this.isMember(memberToBurn))) {
      throw new Error(`Address ${memberToBurn} is not in this pod`);
    }

    let externalPod: Pod;
    if (externalPodIdentifier instanceof Pod) externalPod = externalPodIdentifier;
    else {
      externalPod = await new Pod(externalPodIdentifier);
    }
    if (!externalPod)
      throw new Error(`Could not find a pod with identifier ${externalPodIdentifier}`);

    // External pod must be the admin or a subpod of this pod.
    if (!(this.isAdmin(externalPod.safe) || (await this.isMember(externalPod.safe)))) {
      throw new Error(
        `Pod ${externalPod.safe} must be the admin or a subpod of this pod to make proposals`,
      );
    }

    const signerAddress = await signer.getAddress();
    if (!(await externalPod.isMember(signerAddress)))
      throw new Error(`Signer ${signerAddress} was not a member of the external pod`);

    // Tells MemberToken to mint a new token for this pod to newMember.
    const data = encodeFunctionData('MemberToken', 'burn', [
      ethers.utils.getAddress(memberToBurn),
      this.id,
    ]);

    const { address: memberTokenAddress } = getContract('MemberToken', signer);
    try {
      // Create a safe transaction on this pod, sent from the admin pod
      await createSafeTransaction(
        {
          sender: externalPod.safe,
          safe: this.safe,
          to: memberTokenAddress,
          data,
        },
        signer,
      );
    } catch (err) {
      throw new Error(err);
    }
  };

  /* Transfer membership functions */

  /**
   * Transfers a membership from the signer's account to the memberToTransferTo.
   * @param addressToTransferTo
   * @param signer
   * @returns
   */
  transferMembership = async (addressToTransferTo: string, signer: ethers.Signer) => {
    const checkedAddress = checkAddress(addressToTransferTo);
    if (await this.isMember(checkedAddress)) {
      throw new Error(`Address ${checkedAddress} is already a member of this pod`);
    }

    const signerAddress = await signer.getAddress();
    if (!(await this.isMember(signerAddress))) {
      throw new Error(`Signer ${signerAddress} is not a member of this pod`);
    }

    try {
      return getContract('MemberToken', signer).safeTransferFrom(
        signerAddress,
        checkedAddress,
        this.id,
        1,
        ethers.constants.HashZero,
      );
    } catch (err) {
      return handleEthersError(err);
    }
  };

  proposeTransferMembershipFromSubPod = async (
    subPodIdentifier: Pod | string | number,
    addressToTransferTo: string,
    signer: ethers.Signer,
  ) => {
    const checkedAddress = checkAddress(addressToTransferTo);
    if (await this.isMember(addressToTransferTo)) {
      throw new Error(`Address ${addressToTransferTo} is already in this pod`);
    }

    let subPod: Pod;
    if (subPodIdentifier instanceof Pod) subPod = subPodIdentifier;
    else {
      subPod = await new Pod(subPodIdentifier);
    }
    if (!subPod) throw new Error(`Could not find a pod with identifier ${subPodIdentifier}`);

    // Sub pod must be the admin or a subpod of this pod.
    if (!(await this.isMember(subPod.safe))) {
      throw new Error(`Pod ${subPod.ensName} must be a subpod of this pod to make proposals`);
    }

    const signerAddress = await signer.getAddress();
    if (!(await subPod.isMember(signerAddress)))
      throw new Error(`Signer ${signerAddress} was not a member of sub pod ${subPod.ensName}`);

    // Tells MemberToken to transfer token for this pod from subpod.safe to checkedAddress.
    const data = encodeFunctionData('MemberToken', 'safeTransferFrom', [
      subPod.safe,
      checkedAddress,
      this.id,
      1,
      ethers.constants.HashZero,
    ]);

    const { address: memberTokenAddress } = getContract('MemberToken', signer);
    try {
      // Create a safe transaction on this pod, sent from the admin pod
      await createSafeTransaction(
        {
          sender: subPod.safe,
          safe: this.safe,
          to: memberTokenAddress,
          data,
        },
        signer,
      );
    } catch (err) {
      throw new Error(err);
    }
  };

  /* Transfer/manage admin functions */

  /**
   * Transfers admin role from signer's account to addressToTransferTo
   * @param addressToTransferTo
   * @param signer
   * @returns
   */
  transferAdmin = async (addressToTransferTo: string, signer: ethers.Signer) => {
    const checkedAddress = checkAddress(addressToTransferTo);
    const signerAddress = await signer.getAddress();
    if (!this.isAdmin(signerAddress)) throw new Error('Signer was not the admin of this pod');

    const { abi: controllerAbi } = getControllerByAddress(this.controller, config.network);
    const Controller = new ethers.Contract(this.controller, controllerAbi, signer);

    try {
      return Controller.updatePodAdmin(this.id, checkedAddress);
    } catch (err) {
      return handleEthersError(err);
    }
  };

  proposeTransferAdminFromAdminPod = async (
    adminPodIdentifier: Pod | string | number,
    addressToTransferTo: string,
    signer: ethers.Signer,
  ) => {
    const checkedAddress = checkAddress(addressToTransferTo);
    if (this.isAdmin(addressToTransferTo)) {
      throw new Error(`Address ${addressToTransferTo} is already pod admin`);
    }

    let adminPod: Pod;
    if (adminPodIdentifier instanceof Pod) adminPod = adminPodIdentifier;
    else {
      adminPod = await new Pod(adminPodIdentifier);
    }
    if (!adminPod) throw new Error(`Could not find a pod with identifier ${adminPodIdentifier}`);

    if (!this.isAdmin(adminPod.safe)) {
      throw new Error(`Pod ${adminPod.ensName} must be the admin of this pod`);
    }

    const signerAddress = await signer.getAddress();
    if (!(await adminPod.isMember(signerAddress)))
      throw new Error(`Signer ${signerAddress} was not a member of admin pod ${adminPod.ensName}`);

    const { abi: controllerAbi } = getControllerByAddress(this.controller, config.network);
    const data = new ethers.utils.Interface(controllerAbi).encodeFunctionData('updatePodAdmin', [
      this.id,
      checkedAddress,
    ]);

    try {
      // Create a safe transaction on this pod, sent from the admin pod
      await createSafeTransaction(
        {
          sender: adminPod.safe,
          safe: this.safe,
          to: this.controller,
          data,
        },
        signer,
      );
    } catch (err) {
      throw new Error(err);
    }
  };

  /**
   * Adds newAdminAddress as the admin of this pod, if this pod does not currently have an admin.
   * @param newAdminAddress
   * @param signer
   */
  proposeAddAdmin = async (newAdminAddress: string, signer: ethers.Signer) => {
    const checkedAddress = checkAddress(newAdminAddress);
    const signerAddress = await signer.getAddress();
    if (this.admin) throw new Error('Pod already has admin');

    const { abi: controllerAbi } = getControllerByAddress(this.controller, config.network);
    const data = new ethers.utils.Interface(controllerAbi).encodeFunctionData('updatePodAdmin', [
      this.id,
      checkedAddress,
    ]);

    try {
      // Create a proposal from the signer address
      await createSafeTransaction(
        {
          sender: signerAddress,
          safe: this.safe,
          to: this.controller,
          data,
        },
        signer,
      );
    } catch (err) {
      throw new Error(err);
    }
  };

  /* Migrate functions */

  migratePodToLatest = async (signer: ethers.Signer) => {
    // forcing to newest controller
    const newController = getDeployment('ControllerLatest', config.network);
    const oldController = getControllerByAddress(this.controller, config.network);

    const previousModule = await getPreviousModule(
      this.safe,
      oldController.address,
      newController.address,
      signer,
    );

    // use prev controller
    try {
      const res = await oldController.migratePodController(
        this.id,
        newController.address,
        previousModule,
      );
      return res;
    } catch (err) {
      return handleEthersError(err);
    }
  };

  proposeMigratePodToLatest = async (signer: ethers.Signer) => {
    // forcing to newest controller
    const newController = getDeployment('ControllerLatest', process.env.NEXT_PUBLIC_NETWORK);
    const oldController = getControllerByAddress(this.controller, config.network);

    const previousModule = await getPreviousModule(
      this.safe,
      oldController.address,
      newController.address,
      signer,
    );

    // use prev controller
    const data = new ethers.utils.Interface(oldController.abi).encodeFunctionData(
      'migratePodController',
      [this.id, newController.address, previousModule],
    );

    try {
      await createSafeTransaction(
        {
          sender: await signer.getAddress(),
          safe: this.safe,
          to: oldController.address,
          data,
        },
        signer,
      );
    } catch (err) {
      throw new Error(err);
    }
  };
}
