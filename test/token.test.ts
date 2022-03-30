/* eslint-disable jest/prefer-todo */
import { ethers } from 'ethers';
import axios from 'axios';
import contracts from '@orcaprotocol/contracts';
import * as sdk from '../src';
import * as utils from '../src/lib/utils';
import * as fetchers from '../src/fetchers';
import * as txService from '../src/lib/services/transaction-service';
import {
  artNautPod,
  orcaCorePod,
  memberTokenAddress,
  orcanautAddress,
  orcanautPod,
  userAddress,
  userAddress2,
  constructGqlGetUsers,
} from './fixtures';

// Tests for any token, or token-like functionality (this includes admin transfers)

let provider;

function mockGetPodFetchersByAddress(opts?: { overrideAdmin?: string }) {
  const admin = opts?.overrideAdmin ? opts.overrideAdmin : orcanautPod.admin;
  jest.spyOn(fetchers, 'getPodFetchersByAddressOrEns').mockResolvedValueOnce({
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    Controller: { podAdmin: jest.fn().mockResolvedValue(admin), address: '0x242e1E6cF6C30d36988D8019d0fE2e187325CCEd' },
    safe: orcanautAddress,
    podId: orcanautPod.id,
    Name: { name: orcanautPod.ensName },
  });
}

beforeAll(async () => {
  provider = new ethers.providers.InfuraProvider('mainnet', {
    infura: '69ecf3b10bc24c6a972972666fe950c8',
  });
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  provider.getSigner = () => {
    return userAddress2;
  };
  sdk.init({ provider, network: 1 });
});

beforeEach(() => {
  jest.restoreAllMocks();
});

describe('admin actions', () => {
  test('Mint member should throw if given an invalid address', async () => {
    mockGetPodFetchersByAddress();
    const mockMint = jest.fn();
    jest.spyOn(utils, 'getContract').mockReturnValueOnce({
      mint: mockMint,
    });
    const pod = await sdk.getPod(orcanautAddress);
    await expect(pod.mintMember('wrongpod', provider.getSigner())).rejects.toThrow('Invalid address');
  });
  
  test('As an admin, I should be able to mint a member to a pod', async () => {
    mockGetPodFetchersByAddress();
    const mockMint = jest.fn();
    jest.spyOn(utils, 'getContract').mockReturnValueOnce({
      mint: mockMint,
    });
    const pod = await sdk.getPod(orcanautAddress);
  
    await pod.mintMember(userAddress, provider.getSigner());
    expect(mockMint).toHaveBeenCalledWith(userAddress, orcanautPod.id, ethers.constants.HashZero);
  });
  
  test('As an admin, I should be able to burn a member from a pod', async () => {
    mockGetPodFetchersByAddress();
    const mockBurn = jest.fn();
    jest.spyOn(utils, 'getContract').mockReturnValueOnce({
      burn: mockBurn,
    });
  
    const pod = await sdk.getPod(orcanautAddress);
    // Should return a metamask transaction
    await pod.burnMember(userAddress, provider.getSigner());
    expect(mockBurn).toHaveBeenCalledWith(userAddress, orcanautPod.id);
  });

  test('As an admin, I should be able to transfer my admin rights to another address', async () => {
    mockGetPodFetchersByAddress();
    const mockTransferAdmin = jest.fn();
    jest.spyOn(ethers, 'Contract').mockReturnValue({
      updatePodAdmin: mockTransferAdmin
    });
    const mockSigner = {
      getAddress: jest.fn().mockResolvedValueOnce(orcanautPod.admin),
    };
  
    const pod = await sdk.getPod(orcanautAddress);
    // Should return a metamask transaction
    await pod.transferAdmin(userAddress, mockSigner);
    expect(mockTransferAdmin).toHaveBeenCalledWith(orcanautPod.id, userAddress);
  });
});

describe('member actions', () => {
  test('As a pod member, I should be able to transfer my membership', async () => {
    mockGetPodFetchersByAddress();
    const mockSigner = {
      getAddress: jest.fn().mockResolvedValueOnce(orcanautPod.members[0]),
    };
    const mockTransfer = jest.fn();
    jest.spyOn(utils, 'getContract').mockReturnValueOnce({
      safeTransferFrom: mockTransfer,
    });
    const pod = await sdk.getPod(orcanautAddress);
  
    await pod.transferMembership(userAddress, mockSigner);
    expect(mockTransfer).toHaveBeenCalledWith(orcanautPod.members[0], userAddress, orcanautPod.id, 1, ethers.constants.HashZero);
  });

  test('transferMembership should throw if the new member is already a member', async () => {
    mockGetPodFetchersByAddress();
    const mockSigner = {
      getAddress: jest.fn().mockResolvedValueOnce(userAddress2),
    };
    const pod = await sdk.getPod(orcanautAddress);
  
    // Attempting to transfer membership to already existing member.
    await expect(pod.transferMembership(orcanautPod.members[0], mockSigner)).rejects.toThrow('is already a member of this pod');
  });

  test('As a pod member, I should be able to create a proposal to mint a member', async () => {
    mockGetPodFetchersByAddress();
    jest.spyOn(utils, 'getContract').mockReturnValueOnce({
      address: memberTokenAddress,
    });
    const createSafeTx = jest.spyOn(txService, 'createSafeTransaction').mockReturnValueOnce({});
    const mockSigner = {
      getAddress: jest.fn().mockResolvedValueOnce(userAddress2),
    };
  
    const pod = await sdk.getPod(orcanautAddress);
    await pod.proposeMintMember(userAddress, mockSigner);
    expect(createSafeTx).toHaveBeenCalledWith(
      {
        sender: userAddress2,
        safe: orcanautPod.safe,
        to: memberTokenAddress,
        data: '0x94d008ef0000000000000000000000004b4c43f66ec007d1dbe28f03dac975aab5fbb8880000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000000',
      },
      mockSigner,
    );
  });
  
  test('As a pod member, I should not be able to create a proposal to mint a member that already exists', async () => {
    mockGetPodFetchersByAddress();
    jest.spyOn(axios, 'post').mockResolvedValueOnce(constructGqlGetUsers(orcanautPod.members));
    jest.spyOn(utils, 'getContract').mockReturnValueOnce({
      address: memberTokenAddress,
    });
    const mockSigner = {
      getAddress: jest.fn().mockResolvedValueOnce(userAddress2),
    };
  
    const pod = await sdk.getPod(orcanautAddress);
    await expect(pod.proposeMintMember(orcanautPod.members[0], mockSigner)).rejects.toThrow('is already in this pod');
  });
  
  test('As a pod member, I should not be able to burn a member that is not in the pod', async () => {
    mockGetPodFetchersByAddress();
    jest.spyOn(utils, 'getContract').mockReturnValueOnce({
      address: memberTokenAddress,
    });
    const mockSigner = {
      getAddress: jest.fn().mockResolvedValueOnce(userAddress2),
    };
  
    const pod = await sdk.getPod(orcanautAddress);
    await expect(pod.proposeBurnMember(userAddress2, mockSigner)).rejects.toThrow('is not in this pod');
  });
});

describe('proposeMintMemberFromPod', () => {
  function setupAdminAndSubPod() {
    jest.spyOn(fetchers, 'getPodFetchersByAddressOrEns').mockResolvedValueOnce({
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      Controller: { podAdmin: jest.fn().mockResolvedValue(orcanautPod.admin) },
      safe: orcanautAddress,
      podId: orcanautPod.id,
      Name: { name: orcanautPod.ensName },
    }).mockResolvedValueOnce({
      // Mock artNaut admin to be orcanaut pod.
      Controller: { podAdmin: jest.fn().mockResolvedValue(orcanautPod.safe) },
      safe: artNautPod.safe,
      podId: artNautPod.id,
      Name: { name: artNautPod.ensName },
    });
    jest.spyOn(utils, 'getContract').mockReturnValueOnce({
      address: memberTokenAddress,
    });
    jest.spyOn(axios, 'post')
      .mockResolvedValueOnce(constructGqlGetUsers(orcanautPod.members))
      .mockResolvedValueOnce(constructGqlGetUsers(artNautPod.members));
  }

  test('As a member of an admin pod, I should be able to create a proposal on the admin pod to mint a member to a subpod', async () => {
    setupAdminAndSubPod();
    const mockSigner = {
      // This should be a member of admin pod.
      getAddress: jest.fn().mockResolvedValueOnce(orcanautPod.members[0]),
    };
    const createSafeTx = jest.spyOn(txService, 'createSafeTransaction').mockReturnValueOnce({});
  
    const adminPod = await sdk.getPod(orcanautAddress);
    // subPod is member of adminPod
    const subPod = await sdk.getPod('art-naut.pod.xyz');
  
    // Creates a proposal on the admin pod to mint a new member to subPod using admin privileges.
    await subPod.proposeMintMemberFromPod(adminPod, userAddress2, mockSigner);
    expect(createSafeTx).toHaveBeenCalledWith(
      {
        sender: adminPod.safe,
        safe: subPod.safe,
        to: memberTokenAddress,
        data: '0x94d008ef0000000000000000000000001cc62ce7cb56ed99513823064295761f9b7c856e0000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000000',
      },
      mockSigner,
    );
  });

  test('The function should also accept podIds or safe addresses in lieu of a Pod object', async () => {
    jest.spyOn(fetchers, 'getPodFetchersByAddressOrEns').mockResolvedValueOnce({
      // Mock artNaut admin to be orcanaut pod.
      Controller: { podAdmin: jest.fn().mockResolvedValue(orcanautPod.safe) },
      safe: artNautPod.safe,
      podId: artNautPod.id,
      Name: { name: artNautPod.ensName },
    }).mockResolvedValueOnce({
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      Controller: { podAdmin: jest.fn().mockResolvedValue(orcanautPod.admin) },
      safe: orcanautAddress,
      podId: orcanautPod.id,
      Name: { name: orcanautPod.ensName },
    });
    jest.spyOn(utils, 'getContract').mockReturnValueOnce({
      address: memberTokenAddress,
    });
    jest.spyOn(axios, 'post')
      .mockResolvedValueOnce(constructGqlGetUsers(orcanautPod.members))
      .mockResolvedValueOnce(constructGqlGetUsers(artNautPod.members));

    const mockSigner = {
      // This should be a member of admin pod.
      getAddress: jest.fn().mockResolvedValueOnce(orcanautPod.members[0]),
    };
    const createSafeTx = jest.spyOn(txService, 'createSafeTransaction').mockReturnValueOnce({});

    // subPod is member of adminPod
    const subPod = await sdk.getPod('art-naut.pod.xyz');
  
    // Creates a proposal on the admin pod to mint a new member to subPod using admin privileges.
    await subPod.proposeMintMemberFromPod(orcanautPod.id, userAddress2, mockSigner);
    expect(createSafeTx).toHaveBeenCalledWith(
      {
        sender: orcanautPod.safe,
        safe: subPod.safe,
        to: memberTokenAddress,
        data: '0x94d008ef0000000000000000000000001cc62ce7cb56ed99513823064295761f9b7c856e0000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000000',
      },
      mockSigner,
    );
  });

  test('As a member of a subpod, I should be able to create a proposal on the parent pod to mint a member to the parent', async () => {
    setupAdminAndSubPod();
    const mockSigner = {
      // This should be a member of admin pod.
      getAddress: jest.fn().mockResolvedValueOnce(orcanautPod.members[0]),
    };
    const createSafeTx = jest.spyOn(txService, 'createSafeTransaction').mockReturnValueOnce({});
  
    const parentPod = await sdk.getPod(orcanautAddress);
    // subPod is member of adminPod
    const subPod = await sdk.getPod('art-naut.pod.xyz');
  
    // Creates a proposal on the admin pod to mint a new member to subPod using admin privileges.
    await parentPod.proposeMintMemberFromPod(subPod, userAddress2, mockSigner);
    expect(createSafeTx).toHaveBeenCalledWith(
      {
        sender: subPod.safe,
        safe: parentPod.safe,
        to: memberTokenAddress,
        data: '0x94d008ef0000000000000000000000001cc62ce7cb56ed99513823064295761f9b7c856e0000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000000',
      },
      mockSigner,
    );
  });

  test("Should throw if the adminPod is neither the admin, nor a subpod of the Pod you're trying to mint to", async () => {
    jest.spyOn(fetchers, 'getPodFetchersByAddressOrEns').mockResolvedValueOnce({
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      Controller: { podAdmin: jest.fn().mockResolvedValue(orcaCorePod.admin) },
      safe: orcaCorePod.safe,
      podId: orcaCorePod.id,
      Name: { name: orcaCorePod.ensName },
    }).mockResolvedValueOnce({
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      Controller: { podAdmin: jest.fn().mockResolvedValue(artNautPod.admin) },
      safe: artNautPod.safe,
      podId: artNautPod.id,
      Name: { name: artNautPod.ensName },
    });
    jest.spyOn(utils, 'getContract').mockReturnValueOnce({
      address: memberTokenAddress,
    });

    const mockSigner = {
      // This is a member of orca core.
      getAddress: jest.fn().mockResolvedValueOnce(userAddress2),
    };
  
    const adminPod = await sdk.getPod(orcanautAddress);
    // subPod is member of adminPod
    const subPod = await sdk.getPod('art-naut.pod.xyz');
  
    await expect(subPod.proposeMintMemberFromPod(adminPod, userAddress2, mockSigner)).rejects.toThrow('must be the admin or a subpod of this pod to make proposals');
  });

  test('Should throw if the signer of proposeMintMemberFromPod is not a member of the external pod', async () => {
    setupAdminAndSubPod();
    const mockSigner = {
      // Not a member.
      getAddress: jest.fn().mockResolvedValueOnce(userAddress2),
    };
  
    const adminPod = await sdk.getPod(orcanautAddress);
    // subPod is member of adminPod
    const subPod = await sdk.getPod('art-naut.pod.xyz');
  
    await expect(subPod.proposeMintMemberFromPod(adminPod, userAddress2, mockSigner)).rejects.toThrow('was not a member of the external pod');
  });

  test('Cannot mint a member that already exists on the sub pod', async () => {
    setupAdminAndSubPod();
    const mockSigner = {
      // Member already exists.
      getAddress: jest.fn().mockResolvedValueOnce(ethers.utils.getAddress(artNautPod.members[0])),
    };
  
    const adminPod = await sdk.getPod(orcanautAddress);
    // subPod is member of adminPod
    const subPod = await sdk.getPod('art-naut.pod.xyz');
  
    await expect(subPod.proposeMintMemberFromPod(adminPod, artNautPod.members[0], mockSigner)).rejects.toThrow('is already in this pod');
  });
});

describe('proposeBurnMemberFromPod', () => {
  function setupAdminAndSubPod() {
    jest.spyOn(fetchers, 'getPodFetchersByAddressOrEns').mockResolvedValueOnce({
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      Controller: { podAdmin: jest.fn().mockResolvedValue(orcanautPod.admin) },
      safe: orcanautAddress,
      podId: orcanautPod.id,
      Name: { name: orcanautPod.ensName },
    }).mockResolvedValueOnce({
      // Mock artNaut admin to be orcanaut pod.
      Controller: { podAdmin: jest.fn().mockResolvedValue(orcanautPod.safe) },
      safe: artNautPod.safe,
      podId: artNautPod.id,
      Name: { name: artNautPod.ensName },
    });
    jest.spyOn(utils, 'getContract').mockReturnValueOnce({
      address: memberTokenAddress,
    });
    jest.spyOn(axios, 'post')
      .mockResolvedValueOnce(constructGqlGetUsers(orcanautPod.members))
      .mockResolvedValueOnce(constructGqlGetUsers(artNautPod.members));
  }

  test('As a member of an admin pod, I should be able to create a proposal on the admin pod to burn a member to a subpod', async () => {
    setupAdminAndSubPod();
    const mockSigner = {
      // This should be a member of admin pod.
      getAddress: jest.fn().mockResolvedValueOnce(orcanautPod.members[0]),
    };
    const createSafeTx = jest.spyOn(txService, 'createSafeTransaction').mockReturnValueOnce({});
  
    const adminPod = await sdk.getPod(orcanautAddress);
    // subPod is member of adminPod
    const subPod = await sdk.getPod('art-naut.pod.xyz');
  
    // Creates a proposal on the admin pod to mint a new member to subPod using admin privileges.
    await subPod.proposeBurnMemberFromPod(adminPod, artNautPod.members[0], mockSigner);
    expect(createSafeTx).toHaveBeenCalledWith(
      {
        sender: adminPod.safe,
        safe: subPod.safe,
        to: memberTokenAddress,
        data: '0x9dc29fac000000000000000000000000094a473985464098b59660b37162a284b51327530000000000000000000000000000000000000000000000000000000000000006',
      },
      mockSigner,
    );
  });

  test('The function should also accept podIds or safe addresses in lieu of a Pod object', async () => {
    jest.spyOn(fetchers, 'getPodFetchersByAddressOrEns').mockResolvedValueOnce({
      // Mock artNaut admin to be orcanaut pod.
      Controller: { podAdmin: jest.fn().mockResolvedValue(orcanautPod.safe) },
      safe: artNautPod.safe,
      podId: artNautPod.id,
      Name: { name: artNautPod.ensName },
    }).mockResolvedValueOnce({
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      Controller: { podAdmin: jest.fn().mockResolvedValue(orcanautPod.admin) },
      safe: orcanautAddress,
      podId: orcanautPod.id,
      Name: { name: orcanautPod.ensName },
    });
    jest.spyOn(utils, 'getContract').mockReturnValueOnce({
      address: memberTokenAddress,
    });

    const mockSigner = {
      // This should be a member of admin pod.
      getAddress: jest.fn().mockResolvedValueOnce(orcanautPod.members[0]),
    };
    const createSafeTx = jest.spyOn(txService, 'createSafeTransaction').mockReturnValueOnce({});

    // subPod is member of adminPod
    const subPod = await sdk.getPod('art-naut.pod.xyz');
  
    // Creates a proposal on the admin pod to mint a new member to subPod using admin privileges.
    await subPod.proposeBurnMemberFromPod(orcanautPod.id, artNautPod.members[0], mockSigner);
    expect(createSafeTx).toHaveBeenCalledWith(
      {
        sender: orcanautPod.safe,
        safe: subPod.safe,
        to: memberTokenAddress,
        data: '0x9dc29fac000000000000000000000000094a473985464098b59660b37162a284b51327530000000000000000000000000000000000000000000000000000000000000006',
      },
      mockSigner,
    );
  });

  test('As a member of a subpod, I should be able to create a proposal on the parent pod to burn a member from the parent', async () => {
    setupAdminAndSubPod();
    const mockSigner = {
      // This should be a member of admin pod.
      getAddress: jest.fn().mockResolvedValueOnce(orcanautPod.members[0]),
    };
    const createSafeTx = jest.spyOn(txService, 'createSafeTransaction').mockReturnValueOnce({});
  
    const parentPod = await sdk.getPod(orcanautAddress);
    // subPod is member of adminPod
    const subPod = await sdk.getPod('art-naut.pod.xyz');
  
    // Creates a proposal on the admin pod to mint a new member to subPod using admin privileges.
    await parentPod.proposeBurnMemberFromPod(subPod, orcanautPod.members[0], mockSigner);
    expect(createSafeTx).toHaveBeenCalledWith(
      {
        sender: subPod.safe,
        safe: parentPod.safe,
        to: memberTokenAddress,
        data: '0x9dc29fac000000000000000000000000094a473985464098b59660b37162a284b51327530000000000000000000000000000000000000000000000000000000000000001',
      },
      mockSigner,
    );
  });

  test("Should throw if the adminPod is neither the admin, nor a subpod of the Pod you're trying to mint to", async () => {
    jest.spyOn(fetchers, 'getPodFetchersByAddressOrEns').mockResolvedValueOnce({
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      Controller: { podAdmin: jest.fn().mockResolvedValue(orcaCorePod.admin) },
      safe: orcaCorePod.safe,
      podId: orcaCorePod.id,
      Name: { name: orcaCorePod.ensName },
    }).mockResolvedValueOnce({
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      Controller: { podAdmin: jest.fn().mockResolvedValue(artNautPod.admin) },
      safe: artNautPod.safe,
      podId: artNautPod.id,
      Name: { name: artNautPod.ensName },
    });
    jest.spyOn(utils, 'getContract').mockReturnValueOnce({
      address: memberTokenAddress,
    });

    const mockSigner = {
      // This is a member of orca core.
      getAddress: jest.fn().mockResolvedValueOnce(userAddress2),
    };
  
    const adminPod = await sdk.getPod(orcanautAddress);
    // subPod is member of adminPod
    const subPod = await sdk.getPod('art-naut.pod.xyz');
  
    await expect(subPod.proposeBurnMemberFromPod(adminPod, artNautPod.members[0], mockSigner)).rejects.toThrow('must be the admin or a subpod of this pod to make proposals');
  });

  test('Should throw if the signer of proposeMintMemberFromPod is not a member of the external pod', async () => {
    setupAdminAndSubPod();
    const mockSigner = {
      // Not a member.
      getAddress: jest.fn().mockResolvedValueOnce(userAddress2),
    };
  
    const adminPod = await sdk.getPod(orcanautAddress);
    // subPod is member of adminPod
    const subPod = await sdk.getPod('art-naut.pod.xyz');
  
    await expect(subPod.proposeBurnMemberFromPod(adminPod, artNautPod.members[0], mockSigner)).rejects.toThrow('was not a member of the external pod');
  });

  test('Cannot mint a member that does not exist on the sub pod', async () => {
    setupAdminAndSubPod();
    const mockSigner = {
      // Member already exists.
      getAddress: jest.fn().mockResolvedValueOnce(ethers.utils.getAddress(artNautPod.members[0])),
    };
  
    const adminPod = await sdk.getPod(orcanautAddress);
    // subPod is member of adminPod
    const subPod = await sdk.getPod('art-naut.pod.xyz');
  
    await expect(subPod.proposeBurnMemberFromPod(adminPod, userAddress2, mockSigner)).rejects.toThrow('is not in this pod');
  });
});

describe('proposeTransferMembershipFromSubPod', () => {
  function setupAdminAndSubPod() {
    jest.spyOn(fetchers, 'getPodFetchersByAddressOrEns').mockResolvedValueOnce({
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      Controller: { podAdmin: jest.fn().mockResolvedValue(orcanautPod.admin) },
      safe: orcanautAddress,
      podId: orcanautPod.id,
      Name: { name: orcanautPod.ensName },
    }).mockResolvedValueOnce({
      // Mock artNaut admin to be orcanaut pod.
      Controller: { podAdmin: jest.fn().mockResolvedValue(orcanautPod.safe) },
      safe: artNautPod.safe,
      podId: artNautPod.id,
      Name: { name: artNautPod.ensName },
    });
    jest.spyOn(utils, 'getContract').mockReturnValueOnce({
      address: memberTokenAddress,
    });
    jest.spyOn(axios, 'post')
      .mockResolvedValueOnce(constructGqlGetUsers(orcanautPod.members))
      .mockResolvedValueOnce(constructGqlGetUsers(artNautPod.members));
  }

  test('As a member of a sub pod, I should be able to create a proposal on the sub pod to transfer membership to another address', async () => {
    setupAdminAndSubPod();
    const mockSigner = {
      // This should be a member of admin pod.
      getAddress: jest.fn().mockResolvedValueOnce(artNautPod.members[0]),
    };
    const createSafeTx = jest.spyOn(txService, 'createSafeTransaction').mockReturnValueOnce({});
  
    const adminPod = await sdk.getPod(orcanautAddress);
    // subPod is member of adminPod
    const subPod = await sdk.getPod('art-naut.pod.xyz');
  
    // Creates a proposal on the admin pod to mint a new member to subPod using admin privileges.
    await adminPod.proposeTransferMembershipFromSubPod(subPod, userAddress2, mockSigner);
    expect(createSafeTx).toHaveBeenCalledWith(
      {
        sender: subPod.safe,
        safe: adminPod.safe,
        to: memberTokenAddress,
        data: '0xf242432a00000000000000000000000025f55d2e577a937433686a01439e5ffdffe622180000000000000000000000001cc62ce7cb56ed99513823064295761f9b7c856e0000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000000',
      },
      mockSigner,
    );
  });

  test("Should throw if the provided pod is not a subpod of the Pod you're trying to mint to", async () => {
    jest.spyOn(fetchers, 'getPodFetchersByAddressOrEns').mockResolvedValueOnce({
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      Controller: { podAdmin: jest.fn().mockResolvedValue(orcaCorePod.admin) },
      safe: orcaCorePod.safe,
      podId: orcaCorePod.id,
      Name: { name: orcaCorePod.ensName },
    }).mockResolvedValueOnce({
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      Controller: { podAdmin: jest.fn().mockResolvedValue(artNautPod.admin) },
      safe: artNautPod.safe,
      podId: artNautPod.id,
      Name: { name: artNautPod.ensName },
    });
    jest.spyOn(utils, 'getContract').mockReturnValueOnce({
      address: memberTokenAddress,
    });

    const mockSigner = {
      // This is a member of orca core.
      getAddress: jest.fn().mockResolvedValueOnce(userAddress2),
    };
  
    const adminPod = await sdk.getPod(orcanautAddress);
    // subPod is member of adminPod
    const subPod = await sdk.getPod('art-naut.pod.xyz');
  
    // Recipient address doesn't matter.
    await expect(adminPod.proposeTransferMembershipFromSubPod(subPod, ethers.constants.AddressZero, mockSigner)).rejects.toThrow('must be a subpod of this pod to make proposals');
  });

  test('Should throw if attempting to transfer membership to existing member', async () => {
    setupAdminAndSubPod();
    const mockSigner = {
      // Not a member.
      getAddress: jest.fn().mockResolvedValueOnce(artNautPod.members[0]),
    };
  
    const adminPod = await sdk.getPod(orcanautAddress);
    // subPod is member of adminPod
    const subPod = await sdk.getPod('art-naut.pod.xyz');
  
    await expect(adminPod.proposeTransferMembershipFromSubPod(subPod, artNautPod.members[0], mockSigner)).rejects.toThrow('is already in this pod');
  });

  test('Should throw if the signer of proposeTransferMembershipFromSubPod is not a member of the external pod', async () => {
    setupAdminAndSubPod();
    const mockSigner = {
      // Not a member.
      getAddress: jest.fn().mockResolvedValueOnce(userAddress2),
    };
  
    const adminPod = await sdk.getPod(orcanautAddress);
    // subPod is member of adminPod
    const subPod = await sdk.getPod('art-naut.pod.xyz');
  
    await expect(adminPod.proposeTransferMembershipFromSubPod(subPod, userAddress2, mockSigner)).rejects.toThrow('was not a member of sub pod');
  });
});

describe('proposeTransferAdminFromAdminPod', () => {
  function setupAdminAndSubPod() {
    jest.spyOn(fetchers, 'getPodFetchersByAddressOrEns').mockResolvedValueOnce({
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      Controller: { podAdmin: jest.fn().mockResolvedValue(orcanautPod.admin) },
      safe: orcanautAddress,
      podId: orcanautPod.id,
      Name: { name: orcanautPod.ensName },
    }).mockResolvedValueOnce({
      // Mock artNaut admin to be orcanaut pod.
      Controller: { podAdmin: jest.fn().mockResolvedValue(orcanautPod.safe), address: '0x242e1E6cF6C30d36988D8019d0fE2e187325CCEd' },
      safe: artNautPod.safe,
      podId: artNautPod.id,
      Name: { name: artNautPod.ensName },
    });
    jest.spyOn(utils, 'getContract').mockReturnValueOnce({
      address: memberTokenAddress,
    });
    jest.spyOn(axios, 'post')
      .mockResolvedValueOnce(constructGqlGetUsers(orcanautPod.members))
      .mockResolvedValueOnce(constructGqlGetUsers(artNautPod.members));
  }

  test('As a member of a sub pod, I should be able to create a proposal on the sub pod to transfer admin to another address', async () => {
    setupAdminAndSubPod();
    const mockSigner = {
      // This should be a member of admin pod.
      getAddress: jest.fn().mockResolvedValueOnce(artNautPod.members[0]),
    };
    const createSafeTx = jest.spyOn(txService, 'createSafeTransaction').mockReturnValueOnce({});
  
    const adminPod = await sdk.getPod(orcanautAddress);
    // subPod is member of adminPod
    const subPod = await sdk.getPod('art-naut.pod.xyz');
  
    // Creates a proposal on the admin pod to mint a new member to subPod using admin privileges.
    await subPod.proposeTransferAdminFromAdminPod(adminPod, userAddress2, mockSigner);
    expect(createSafeTx).toHaveBeenCalledWith(
      {
        sender: adminPod.safe,
        safe: subPod.safe,
        to: subPod.controller,
        data: '0x346e5c4800000000000000000000000000000000000000000000000000000000000000060000000000000000000000001cc62ce7cb56ed99513823064295761f9b7c856e',
      },
      mockSigner,
    );
  });

  test("Should throw if the provided pod is not the admin pod of this pod", async () => {
    jest.spyOn(fetchers, 'getPodFetchersByAddressOrEns').mockResolvedValueOnce({
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      Controller: { podAdmin: jest.fn().mockResolvedValue(orcaCorePod.admin) },
      safe: orcaCorePod.safe,
      podId: orcaCorePod.id,
      Name: { name: orcaCorePod.ensName },
    }).mockResolvedValueOnce({
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      Controller: { podAdmin: jest.fn().mockResolvedValue(artNautPod.admin) },
      safe: artNautPod.safe,
      podId: artNautPod.id,
      Name: { name: artNautPod.ensName },
    });
    jest.spyOn(utils, 'getContract').mockReturnValueOnce({
      address: memberTokenAddress,
    });

    const mockSigner = {
      // This is a member of orca core.
      getAddress: jest.fn().mockResolvedValueOnce(userAddress2),
    };
  
    const adminPod = await sdk.getPod(orcanautAddress);
    // subPod is member of adminPod
    const subPod = await sdk.getPod('art-naut.pod.xyz');
  
    // Recipient address doesn't matter.
    await expect(subPod.proposeTransferAdminFromAdminPod(adminPod, ethers.constants.AddressZero, mockSigner)).rejects.toThrow('must be the admin of this pod');
  });

  test('Should throw if attempting to transfer admin role to the existing admin', async () => {
    setupAdminAndSubPod();
    const mockSigner = {
      // Not a member.
      getAddress: jest.fn().mockResolvedValueOnce(artNautPod.admin),
    };
  
    const adminPod = await sdk.getPod(orcanautAddress);
    // subPod is member of adminPod
    const subPod = await sdk.getPod('art-naut.pod.xyz');
  
    await expect(subPod.proposeTransferAdminFromAdminPod(adminPod, subPod.admin, mockSigner)).rejects.toThrow('is already pod admin');
  });

  test('Should throw if the signer of proposeTransferAdminFromAdminPod is not a member of the admin pod', async () => {
    setupAdminAndSubPod();
    const mockSigner = {
      // Not a member.
      getAddress: jest.fn().mockResolvedValueOnce(userAddress2),
    };
  
    const adminPod = await sdk.getPod(orcanautAddress);
    // subPod is member of adminPod
    const subPod = await sdk.getPod('art-naut.pod.xyz');
  
    await expect(subPod.proposeTransferAdminFromAdminPod(adminPod, userAddress2, mockSigner)).rejects.toThrow('was not a member of admin pod');
  });
});

describe('proposeAddAdmin', () => {
  test('As a pod member, I should be able to create a proposal to add an admin', async () => {
    mockGetPodFetchersByAddress({ overrideAdmin: ethers.constants.AddressZero });
    jest.spyOn(utils, 'getContract').mockReturnValueOnce({
      address: memberTokenAddress,
    });
    const createSafeTx = jest.spyOn(txService, 'createSafeTransaction').mockReturnValueOnce({});
    const mockSigner = {
      getAddress: jest.fn().mockResolvedValueOnce(userAddress2),
    };
  
    const pod = await sdk.getPod(orcanautAddress);
    await pod.proposeAddAdmin(userAddress2, mockSigner);
    expect(createSafeTx).toHaveBeenCalledWith(
      {
        sender: userAddress2,
        safe: pod.safe,
        to: pod.controller,
        data: '0x346e5c4800000000000000000000000000000000000000000000000000000000000000010000000000000000000000001cc62ce7cb56ed99513823064295761f9b7c856e',
      },
      mockSigner,
    );
  });

  test('Should not be able to create a proposal to add admin if there is already an admin', async () => {
    mockGetPodFetchersByAddress();
    jest.spyOn(utils, 'getContract').mockReturnValueOnce({
      address: memberTokenAddress,
    });
    const createSafeTx = jest.spyOn(txService, 'createSafeTransaction').mockReturnValueOnce({});
    const mockSigner = {
      getAddress: jest.fn().mockResolvedValueOnce(userAddress2),
    };
  
    const pod = await sdk.getPod(orcanautAddress);
    await expect(pod.proposeAddAdmin(userAddress2, mockSigner)).rejects.toThrow('Pod already has admin');
  });
});

describe('Pod migration', () => {
  test('Should be able to migrate pod controller', async () => {
    mockGetPodFetchersByAddress();
    const mockSigner = {
      getAddress: jest.fn().mockResolvedValueOnce(userAddress2),
    };
    const mockMigrate = jest.fn();
    jest.spyOn(contracts, 'getDeployment').mockReturnValue({
      address: '0x242e1E6cF6C30d36988D8019d0fE2e187325CCEd',
    });
    jest.spyOn(contracts, 'getControllerByAddress').mockReturnValue({
      address: '0x242e1E6cF6C30d36988D8019d0fE2e187325CCEd',
      migratePodController: mockMigrate,
    });
    jest.spyOn(utils, 'getPreviousModule').mockResolvedValueOnce('0x242e1E6cF6C30d36988D8019d0fE2e187325CCEd');

    const pod = await sdk.getPod(orcanautAddress);

    await pod.migratePodToLatest(mockSigner);
    expect(mockMigrate).toHaveBeenCalledWith(
      pod.id, '0x242e1E6cF6C30d36988D8019d0fE2e187325CCEd', '0x242e1E6cF6C30d36988D8019d0fE2e187325CCEd'
    );
  });

  test('Should be able to propose a pod migration', async () => {
    mockGetPodFetchersByAddress();
    const mockSigner = {
      getAddress: jest.fn().mockResolvedValueOnce(userAddress2),
    };
    const mockMigrate = jest.fn();
    jest.spyOn(contracts, 'getDeployment').mockReturnValue({
      address: '0x242e1E6cF6C30d36988D8019d0fE2e187325CCEd',
    });
    jest.spyOn(utils, 'getPreviousModule').mockResolvedValueOnce('0x242e1E6cF6C30d36988D8019d0fE2e187325CCEd');
    const createSafeTx = jest.spyOn(txService, 'createSafeTransaction').mockReturnValueOnce({});

    const pod = await sdk.getPod(orcanautAddress);

    await pod.proposeMigratePodToLatest(mockSigner);

    expect(createSafeTx).toHaveBeenCalledWith(
      {
        sender: userAddress2,
        safe: pod.safe,
        to: pod.controller,
        data: '0xe1fc2cc10000000000000000000000000000000000000000000000000000000000000001000000000000000000000000242e1e6cf6c30d36988d8019d0fe2e187325cced000000000000000000000000242e1e6cf6c30d36988d8019d0fe2e187325cced',
      },
      mockSigner,
    );
  })
});