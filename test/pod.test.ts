import { ethers } from 'ethers';
import axios from 'axios';
import { init, getPod, config } from '../src';
import {
  gqlGetUsers,
  orcanautAddress,
  orcanautPod,
  userAddress,
  userAddress2,
  constructGqlGetUsers,
  artNautPod,
} from './fixtures';
import * as fetchers from '../src/fetchers';
import Pod from '../src/Pod';

function mockGetPodFetchersByAddress(opts?: { overrideAdmin?: string }) {
  const admin = opts?.overrideAdmin ? opts.overrideAdmin : orcanautPod.admin;
  jest.spyOn(fetchers, 'getPodFetchersByAddressOrEns').mockResolvedValueOnce({
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    Controller: { podAdmin: jest.fn().mockResolvedValueOnce(admin) },
    Safe: {
      address: orcanautPod.safe,
      nonce: jest.fn().mockResolvedValueOnce({ toNumber: jest.fn().mockImplementation(() => 5) }),
      getThreshold: jest
        .fn()
        .mockResolvedValueOnce({ toNumber: jest.fn().mockImplementation(() => 10) }),
    },
    podId: orcanautPod.id,
    Name: { name: orcanautPod.ensName },
  });
}

const provider = new ethers.providers.InfuraProvider('mainnet', {
  infura: '69ecf3b10bc24c6a972972666fe950c8',
});

beforeAll(async () => {
  init({ provider, network: 1 });
});

beforeEach(() => {
  jest.restoreAllMocks();
});

// test('getPod should be able to fetch via address', async () => {
//   mockGetPodFetchersByAddress();
//   const pod = await getPod(orcanautAddress);
//   expect(pod.id).toEqual(orcanautPod.id);
//   expect(pod.safe).toEqual(orcanautPod.safe);
//   expect(pod.imageNoTextUrl).toEqual(orcanautPod.imageNoTextUrl);
//   expect(pod.admin).toEqual(orcanautPod.admin);
//   expect(pod.ensName).toEqual(orcanautPod.ensName);
//   expect(pod.nonce).toBe(5);
//   expect(pod.threshold).toBe(10);
// });

// test('getPod should be able to fetch via ens name', async () => {
//   mockGetPodFetchersByAddress();
//   const pod = await getPod(orcanautPod.ensName);
//   expect(pod.id).toEqual(orcanautPod.id);
//   expect(pod.safe).toEqual(orcanautPod.safe);
//   expect(pod.imageNoTextUrl).toEqual(orcanautPod.imageNoTextUrl);
//   expect(pod.admin).toEqual(orcanautPod.admin);
//   expect(pod.ensName).toEqual(orcanautPod.ensName);
// });

// test('getPod should be able to fetch via pod id', async () => {
//   mockGetPodFetchersByAddress();
//   const pod = await getPod(orcanautPod.id);
//   expect(pod.id).toEqual(orcanautPod.id);
//   expect(pod.safe).toEqual(orcanautPod.safe);
//   expect(pod.imageNoTextUrl).toEqual(orcanautPod.imageNoTextUrl);
//   expect(pod.admin).toEqual(orcanautPod.admin);
//   expect(pod.ensName).toEqual(orcanautPod.ensName);
// });

// test('getPod should return null if given a value that doesnt resolve to an address', async () => {
//   const pod = await getPod('not valid string');
//   expect(pod).toBe(null);
// });

// test('getPod should return null if the given address is not a pod', async () => {
//   jest.spyOn(fetchers, 'getPodFetchersByAddressOrEns').mockImplementationOnce(() => {
//     throw new Error('failed pod fetch or whatever');
//   });
//   const pod = await getPod(ethers.constants.AddressZero);
//   expect(pod).toBeNull();
// });

// test('pod.admin should be null if there is none', async () => {
//   mockGetPodFetchersByAddress({ overrideAdmin: ethers.constants.AddressZero });
//   const pod = await getPod(orcanautAddress);
//   expect(pod.admin).toBeNull();
// });

// test('getPod should be able to fetch members via async call', async () => {
//   mockGetPodFetchersByAddress();
//   jest.spyOn(axios, 'post').mockResolvedValueOnce(gqlGetUsers);

//   const pod = await getPod(orcanautAddress);
//   const members = await pod.getMembers();
//   expect(members).toEqual([
//     '0x25F55d2e577a937433686A01439E5fFdffe62218',
//     '0x46E69D6801d4E09360Ab62A638849D72623A2e7E',
//     '0x4846162806B025Dcd0759cACF9ec6F9474274282',
//     '0x7aAef56837f37965fb410F4901bDC1172870e2F8',
//     '0x7B54195b743BF76c314e9dBDDf110F5a22743998',
//     '0x7f08D6A56b7B6f75eb8c628384855b82D2Ab18C8',
//     '0x7f33BeaA131a6896B97E27c505c532cE40f88f33',
//     '0xAfBb354FF03E17b1EffBaF661FFca106ba78b966',
//     '0xcABB78f39Fbeb0CdFBD3C8f30E37630EB9e7A151',
//   ]);
// });

// test('Pod object should be able to fetch member pods via async call', async () => {
//   mockGetPodFetchersByAddress();
//   // Additional mock to fill out the artnaut pod (i.e., the member pod)
//   jest.spyOn(fetchers, 'getPodFetchersByAddressOrEns').mockResolvedValueOnce({
//     // eslint-disable-next-line @typescript-eslint/ban-ts-comment
//     // @ts-ignore
//     Controller: { podAdmin: jest.fn().mockResolvedValueOnce(artNautPod.admin) },
//     Safe: {
//       address: artNautPod.safe,
//       nonce: jest.fn().mockResolvedValueOnce({ toNumber: jest.fn().mockImplementation(() => 5) }),
//       getThreshold: jest
//         .fn()
//         .mockResolvedValueOnce({ toNumber: jest.fn().mockImplementation(() => 10) }),
//     },
//     podId: artNautPod.id,
//     Name: { name: artNautPod.ensName },
//   });
//   jest
//     .spyOn(axios, 'post')
//     .mockResolvedValueOnce(constructGqlGetUsers(['0x25F55d2e577a937433686A01439E5fFdffe62218']));

//   const rootPod = await getPod(orcanautAddress);
//   const memberPods = await rootPod.getMemberPods();
//   const podNames = memberPods.map(pod => pod.ensName);
//   expect(podNames).toEqual(expect.arrayContaining(['art-naut.pod.xyz']));
// });

// test('Pod.getMembers() should include member pods in its list', async () => {
//   mockGetPodFetchersByAddress();
//   jest
//     .spyOn(axios, 'post')
//     .mockResolvedValueOnce(constructGqlGetUsers(['0x25F55d2e577a937433686A01439E5fFdffe62218']));
//   // Additional mock to fill out the artnaut pod (i.e., the member pod)
//   jest.spyOn(fetchers, 'getPodFetchersByAddressOrEns').mockResolvedValueOnce({
//     // eslint-disable-next-line @typescript-eslint/ban-ts-comment
//     // @ts-ignore
//     Controller: { podAdmin: jest.fn().mockResolvedValueOnce(artNautPod.admin) },
//     Safe: {
//       address: artNautPod.safe,
//       nonce: jest.fn().mockResolvedValueOnce({ toNumber: jest.fn().mockImplementation(() => 5) }),
//       getThreshold: jest
//         .fn()
//         .mockResolvedValueOnce({ toNumber: jest.fn().mockImplementation(() => 10) }),
//     },
//     podId: artNautPod.id,
//     Name: { name: artNautPod.ensName },
//   });

//   const rootPod = await getPod(orcanautAddress);
//   const [artNaut] = await rootPod.getMemberPods();
//   const members = await rootPod.getMembers();

//   // users should contain the safe addresses of member pods
//   expect(members).toEqual(expect.arrayContaining([artNaut.safe]));
// });

// // Test commented out because it's not really testing anything, but probably useful down the line.
// // test('Pod.getMemberEOAs() should not include pod members', async () => {
// //   mockGetPodFetchersByAddress();
// //   jest.spyOn(axios, 'post').mockResolvedValueOnce(gqlGetUsers);

// //   const rootPod = await getPod(orcanautAddress);
// //   const members = await rootPod.getMembers();
// //   const EOAs = await rootPod.getMemberEOAs();

// //   expect(members).toEqual(
// //     expect.arrayContaining([
// //       '0xcABB78f39Fbeb0CdFBD3C8f30E37630EB9e7A151',
// //       '0xAfBb354FF03E17b1EffBaF661FFca106ba78b966',
// //       '0x46E69D6801d4E09360Ab62A638849D72623A2e7E',
// //       '0x4846162806B025Dcd0759cACF9ec6F9474274282',
// //       '0x7B54195b743BF76c314e9dBDDf110F5a22743998',
// //     ]),
// //   );
// //   expect(members.length).toBeGreaterThan(EOAs.length);
// //   expect(EOAs.every(element => typeof element === 'string')).toBeTruthy();
// // });

// // Test commented out because it's not really testing anything, but probably useful down the line.
// // test('Pod.getMemberPods() should not include non-pod users', async () => {
// //   mockGetPodFetchersByAddress();
// //   jest.spyOn(axios, 'post').mockResolvedValueOnce(gqlGetUsers);

// //   const rootPod = await getPod(orcanautAddress);
// //   const members = await rootPod.getMembers();
// //   const memberPods = await rootPod.getMemberPods();

// //   // rootPod has some users that are not pods,
// //   // therefore there should be more users than member pods.
// //   expect(members.length).toBeGreaterThan(memberPods.length);
// //   expect(memberPods.every(pod => pod instanceof Pod)).toBeTruthy();
// // });

// test('Pod.getMemberPods should also async fetch memberEOAs', async () => {
//   mockGetPodFetchersByAddress();
//   jest.spyOn(axios, 'post').mockResolvedValueOnce(gqlGetUsers);

//   const rootPod = await getPod(orcanautAddress);
//   await rootPod.getMemberPods();

//   expect(rootPod.memberEOAs.length > 0).toBeTruthy();
// });

// test('Pod.isMember() should return true/false if a given address is a member', async () => {
//   mockGetPodFetchersByAddress();
//   jest.spyOn(axios, 'post').mockResolvedValueOnce(gqlGetUsers);

//   const pod = await getPod(orcanautAddress);
//   // User address.
//   const isMember1 = await pod.isMember('0x46E69D6801d4E09360Ab62A638849D72623A2e7E');
//   expect(isMember1).toBe(true);
//   const isMember1LowerCase = await pod.isMember('0x46e69d6801d4e09360ab62a638849d72623a2e7e');
//   expect(isMember1LowerCase).toBe(true);
//   const isMember2 = await pod.isMember(userAddress2);
//   expect(isMember2).toBe(false);
//   // Pod address
//   const isMemberPod = await pod.isMember('0x7aAef56837f37965fb410F4901bDC1172870e2F8');
//   expect(isMemberPod).toBe(true);
// });

// test('Pod.isMember() should reject on non-address inputs', async () => {
//   mockGetPodFetchersByAddress();
//   jest.spyOn(axios, 'post').mockResolvedValueOnce(gqlGetUsers);

//   const pod = await getPod(orcanautAddress);
//   await expect(pod.isMember('not an address')).rejects.toThrow('Invalid address');
// });

// test('Pod.isAdmin() should return true/false if a given address is the admin', async () => {
//   mockGetPodFetchersByAddress();
//   jest.spyOn(axios, 'post').mockResolvedValueOnce(gqlGetUsers);

//   const pod = await getPod(orcanautAddress);
//   const isAdmin1 = pod.isAdmin('0x094A473985464098b59660B37162a284b5132753');
//   expect(isAdmin1).toBe(true);
//   const isAdmin1LowerCase = pod.isAdmin('0x094A473985464098b59660B37162a284b5132753'.toLowerCase());
//   expect(isAdmin1LowerCase).toBe(true);
//   const isAdmin2 = pod.isAdmin(userAddress);
//   expect(isAdmin2).toBe(false);
// });

// test('Pod.isAdmin() should throw if given a non-address input', async () => {
//   mockGetPodFetchersByAddress();
//   jest.spyOn(axios, 'post').mockResolvedValueOnce(gqlGetUsers);

//   const pod = await getPod(orcanautAddress);
//   expect(() => {
//     pod.isAdmin('not an address');
//   }).toThrow('Invalid address');
// });

// // Commented out because these tests are messing with CI/CD
// // test('Pod.isAdminPodMember() should return true/false if a given address is a member of the admin pod', async () => {
// //   mockGetPodFetchersByAddress({ overrideAdmin: artNautPod.safe });
// //   jest.spyOn(axios, 'post').mockResolvedValueOnce(constructGqlGetUsers(artNautPod.members));

// //   const pod = await getPod(orcanautAddress);
// //   // Artnaut pod member
// //   expect(await pod.isAdminPodMember('0x094A473985464098b59660B37162a284b5132753')).toBe(true);
// //   // Not an adminPod member.
// //   expect(await pod.isAdminPodMember(userAddress)).toBe(false);
// // });

// // test('Pod.isSubPodMember() should return true/false if a given address is a nested member', async () => {
// //   mockGetPodFetchersByAddress();
// //   jest
// //     .spyOn(axios, 'post')
// //     // Populates members on the pod to be artNaut pod.
// //     .mockResolvedValueOnce(constructGqlGetUsers([artNautPod.safe]))
// //     // Populates members on the first subPod (i.e., the artNaut pod)
// //     .mockResolvedValueOnce(constructGqlGetUsers([artNautPod.members[0]]));

// //   const pod = await getPod(orcanautAddress);
// //   const isSubPodMember1 = await pod.isSubPodMember(artNautPod.members[0]);
// //   expect(isSubPodMember1).toBe(true);
// //   const isSubPodMember1LowerCase = await pod.isSubPodMember(artNautPod.members[0].toLowerCase());
// //   expect(isSubPodMember1LowerCase).toBe(true);
// //   const isSubPodMember2 = await pod.isSubPodMember(userAddress);
// //   expect(isSubPodMember2).toBe(false);
// // });

// test('Pod.isNestedMember() should throw on non-address inputs', async () => {
//   mockGetPodFetchersByAddress();
//   jest.spyOn(axios, 'post').mockResolvedValueOnce(gqlGetUsers);

//   const pod = await getPod(orcanautAddress);
//   await expect(pod.isSubPodMember('not an address')).rejects.toThrow('Invalid address');
// });

test('Pod.ejectSafe', async () => {
  // mockGetPodFetchersByAddress();
  const mockSigner = {
    getAddress: jest.fn().mockResolvedValueOnce(userAddress),
  };

  const pod = await getPod(orcanautAddress);
  await expect(pod.ejectSafe(provider)).rejects.toThrow('you may need to upgrade to the latest');
});

//TODO: Other ejectSafe tests.
