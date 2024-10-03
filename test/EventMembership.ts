import {ethers} from "hardhat";
import {expect} from "chai";
import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {EventMembership} from "../typechain-types";
import {anyUint} from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import {Signer} from "ethers";

describe("EventMembership Contract", function () {

    const MembershipType = {REGULAR: 0, GOLD: 1, VIP: 2, NA: 3}
    const MemberStatus = {WAITING_APPROVAL: 0, ACTIVE: 1, REJECTED: 2}
    const Role = {MEMBER: 0, MANAGER: 1, EVENT_ADMIN: 2, MEMBERSHIP_ADMIN: 3}
    const EventStatus = {ACTIVE: 0, INACTIVE: 1}

    async function setupFixture() {
        const [owner, user1, user2] = await ethers.getSigners()
        const contract = await ethers.deployContract("EventMembership") as EventMembership
        return {contract, owner, user1, user2}
    }

    async function createMember(contract: EventMembership, user: Signer, membershipType: any) {
        const registrationFee = ethers.parseEther("0.01");
        await expect(contract.connect(user).registerMember(membershipType, {value: registrationFee}))
            .to.emit(contract, "MemberRegistered")
            .withArgs(await user.getAddress(), membershipType, registrationFee, anyUint);

        return await contract.members(await user.getAddress());
    }

    async function createAdmin(contract: EventMembership, user: Signer, role: any) {
        await contract.addAdmin(await user.getAddress(), role)
        return await contract.admins(await user.getAddress())
    }

    async function createNewEvent(contract: EventMembership, user1: Signer) {
        const eventName = "Blockchain Conference";
        const quota = 100;
        const earlyAccessDays = 5;

        const tx = await contract.connect(user1).createNewEvent(eventName, quota, earlyAccessDays);
        const receipt = await tx.wait();

        const eventCreatedLog = receipt.logs.find(log => {
            try {
                const decoded = contract.interface.parseLog(log);
                return decoded.name === 'EventCreated'
            } catch (error) {
                return false;
            }
        });

        const decodedLog = contract.interface.parseLog(eventCreatedLog);
        const [eventId, emittedEventName, emittedQuota, emittedEarlyAccessDays] = decodedLog.args;
        const fetchedEvent = await contract.events(eventId);
        expect(fetchedEvent.status).to.equal(EventStatus.ACTIVE);
        return eventId;
    }

    describe('Membership Management', () => {
        it('should deploy contract and set correct owner', async () => {
            const {contract, owner} = await loadFixture(setupFixture)
            expect(await contract.owner()).to.equal(owner.address)
        })

        it('should allow registration for a new member', async () => {
            const {contract, owner, user1} = await loadFixture(setupFixture)
            const initialMember = await contract.members(user1.address)
            expect(initialMember.memberId).to.equal(ethers.ZeroAddress)

            const newMember = await createMember(contract, user1, MembershipType.REGULAR);

            expect(newMember.memberId).to.equal(user1.address)
            expect(newMember.memberType).to.equal(MembershipType.REGULAR)
            expect(newMember.memberStatus).to.equal(MemberStatus.WAITING_APPROVAL)
            expect(newMember.role).to.equal(Role.MEMBER)
        })

        it('should able to approve member registration by Membership Admin and emit event', async () => {
            const {contract, owner, user1, user2} = await loadFixture(setupFixture)

            const initialMember = await contract.members(user1.address);
            expect(initialMember.memberId).to.equal(ethers.ZeroAddress)
            const initialAdmin = await contract.admins(user2.address);
            expect(initialAdmin.adminId).to.equal(ethers.ZeroAddress)

            await contract.addAdmin(user2.address, Role.MEMBERSHIP_ADMIN)

            const newMember = await createMember(contract, user1, MembershipType.REGULAR);
            const membershipAdmin = await contract.admins(user2.address);

            expect(membershipAdmin.role).to.equal(Role.MEMBERSHIP_ADMIN)
            expect(newMember.memberStatus).to.equal(MemberStatus.WAITING_APPROVAL)

            await expect(contract.connect(user2).approveMemberRegistration(user1.address))
                .to.emit(contract, 'MemberApproved')
                .withArgs(user1.address)

            const updatedMember = await contract.members(user1.address)
            expect(updatedMember.memberStatus).to.equal(MemberStatus.ACTIVE)
        });

        it('should able to reject member registration by Membership Admin and emit event', async () => {
            const {contract, owner, user1, user2} = await loadFixture(setupFixture)

            const initialBalance = await ethers.provider.getBalance(user1.address);

            const membershipAdmin = await createAdmin(contract, user2, Role.MEMBERSHIP_ADMIN)
            const newMember = await createMember(contract, user1, MembershipType.REGULAR)

            expect(membershipAdmin.role).to.equal(Role.MEMBERSHIP_ADMIN)
            expect(newMember.memberStatus).to.equal(MemberStatus.WAITING_APPROVAL)

            await expect(contract.connect(user2).rejectMemberRegistration(user1.address))
                .to.emit(contract, 'MemberRejected')
                .withArgs(user1.address, 0)

            const finalBalance = await ethers.provider.getBalance(user1.address);

            const updatedMember = await contract.members(user1.address)
            expect(updatedMember.memberStatus).to.equal(MemberStatus.REJECTED)
            expect(initialBalance).to.greaterThan(finalBalance)
        })

        it('should allow Event Admin to create a new event', async () => {
            const {contract, user1} = await loadFixture(setupFixture);

            const eventAdmin = await createAdmin(contract, user1, Role.EVENT_ADMIN);
            expect(eventAdmin.role).to.equal(Role.EVENT_ADMIN);

            const eventName = "Blockchain Conference"
            const quota = 100
            const earlyAccessDays = 5

            const response = await contract.connect(user1).createNewEvent(eventName, quota, earlyAccessDays);
            const receipt = await response.wait();

            const eventCreatedLog = receipt.logs.find(log => {
                try {
                    const decoded = contract.interface.parseLog(log);
                    return decoded.name === 'EventCreated'
                } catch (error) {
                    return false;
                }
            });

            const decodedLog = contract.interface.parseLog(eventCreatedLog);
            const [eventId, emittedEventName, emittedQuota, emittedEarlyAccessDays] = decodedLog.args;
            const createdEvent = await contract.events(eventId);
            expect(createdEvent).exist
            expect(emittedEventName).to.equal(eventName)
        });

        it('should fail to create an event with a non-positive quota or early access days', async () => {
            const {contract, user1} = await loadFixture(setupFixture);

            const eventAdmin = await createAdmin(contract, user1, Role.EVENT_ADMIN)
            expect(eventAdmin.role).to.equal(Role.EVENT_ADMIN)

            const eventName = "Test Event";

            await expect(contract.connect(user1).createNewEvent(eventName, 0, 5))
                .to.be.revertedWith("Event must have a positive quota.");

            await expect(contract.connect(user1).createNewEvent(eventName, 100, 0))
                .to.be.revertedWith("Early access duration must be positive.");
        });

        it('should allow Membership Admin to update registration fee', async () => {
            const {contract, user1} = await loadFixture(setupFixture);

            const eventAdmin = await createAdmin(contract, user1, Role.MEMBERSHIP_ADMIN)
            expect(eventAdmin.role).to.equal(Role.MEMBERSHIP_ADMIN)

            const currentFee = ethers.parseEther("0.05");
            const newFee = ethers.parseEther("1");

            expect(await contract.membershipPricing(MembershipType.GOLD)).to.equal(currentFee)
            await expect(contract.connect(user1).setRegistrationFee(MembershipType.GOLD, newFee))
                .to.emit(contract, 'UpdateMembershipFee')
                .withArgs(user1.address, newFee)

            const updatedFee = await contract.membershipPricing(MembershipType.GOLD)
            expect(updatedFee).to.equal(newFee)
        });

        it('should allow Event Admin to cancel an event', async () => {
            const {contract, user1} = await loadFixture(setupFixture);

            const eventAdmin = await createAdmin(contract, user1, Role.EVENT_ADMIN);
            expect(eventAdmin.role).to.equal(Role.EVENT_ADMIN);

            const eventId = await createNewEvent(contract, user1);

            await expect(contract.connect(user1).cancelEvent(eventId))
                .to.emit(contract, 'EventCancelled')
                .withArgs(eventId);

            const updatedEvent = await contract.events(eventId);
            expect(updatedEvent.status).to.equal(EventStatus.INACTIVE);
        })

        it("should allow a user to register for an active event", async function () {
            const {contract, user1, user2} = await loadFixture(setupFixture);

            await createAdmin(contract, user1, Role.EVENT_ADMIN)
            const eventId = await createNewEvent(contract, user1);
            expect(contract.eventRegistrations.length).to.equal(0);

            await contract.connect(user2).registerToEvent(eventId)
            expect(await contract.eventRegistrations(user2, eventId)).to.true

            const updatedEvent = await contract.events(eventId);
            expect(updatedEvent.participants).to.equal(1)
        })
    });
})