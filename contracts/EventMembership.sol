// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.27;

contract EventMembership {

    event RoleAssigned(address _user, Role _roleType);
    event MemberApproved(address _address);
    event MemberRejected(address _address, uint256 _refundAmount);
    event MemberRegistered(address _member, MembershipType _memberType, uint256 _feePaid, uint256 _expiryDate);
    event UpdateMembershipFee(address _manager, uint _newFee);
    event EventCreated(bytes32 _eventId, string _eventName, uint256 _quota, uint256 _earlyAccessDays);
    event EventCancelled(bytes32 _eventId);
    event EventRegistered(address _member, bytes32 _eventId);

    enum MembershipType {
        REGULAR,
        GOLD,
        VIP,
        NA
    }

    enum Role {
        MEMBER,
        EVENT_ADMIN,
        MEMBERSHIP_ADMIN
    }

    enum MemberStatus {
        WAITING_APPROVAL,
        ACTIVE,
        REJECTED
    }

    enum AdminStatus {
        ACTIVE,
        INACTIVE
    }

    enum EventStatus {
        ACTIVE,
        INACTIVE
    }

    address public owner;

    struct Member {
        address memberId;
        MembershipType memberType;
        MemberStatus memberStatus;
        Role role;
        uint256 registerAt;
    }

    struct Admin {
        address adminId;
        Role role;
    }

    struct Event {
        string eventName;
        uint256 quota;
        uint256 participants;
        uint256 vipParticipants;
        uint256 earlyAccessDurationInDays;
        uint256 earlyAccessStartTime;
        EventStatus status;
    }

    mapping(bytes32 => Event) public events;
    mapping(address => Admin)  public admins;
    mapping(address => Member) public members;
    mapping(MembershipType => uint256) public membershipPricing;
    mapping(address => mapping(bytes32 => bool)) public eventRegistrations;

    uint public constant membershipPeriod = 30 days;

    constructor() {
        owner = msg.sender;
        membershipPricing[MembershipType.REGULAR] = 0.01 ether;
        membershipPricing[MembershipType.GOLD] = 0.05 ether;
        membershipPricing[MembershipType.VIP] = 0.1 ether;
        membershipPricing[MembershipType.NA] = 0;
    }

    function registerMember(MembershipType _membershipType) public payable {
        require(members[msg.sender].memberId == address(0), "You are already registered");
        require(_membershipType != MembershipType.NA, "Invalid membership type for registration");
        uint256 requiredFee = membershipPricing[_membershipType];
        require(msg.value == requiredFee, "Incorrect Ether sent for the selected membership type");

        members[msg.sender] = Member({
            memberId: msg.sender,
            memberType: _membershipType,
            memberStatus: MemberStatus.WAITING_APPROVAL,
            role: Role.MEMBER,
            registerAt: block.timestamp
        });

        uint256 expiryDate = block.timestamp + membershipPeriod;
        emit MemberRegistered(msg.sender, _membershipType, msg.value, expiryDate);
    }

    function getMemberDetail(address _member) public view returns (Member memory) {
        require(members[_member].memberId != address(0), "Member does not exist.");
        return members[_member];
    }

    function approveMemberRegistration(address _member) public onlyMembershipAdmin(msg.sender) {
        require(members[_member].memberId != address(0), "Member does not exist.");
        require(members[_member].memberStatus == MemberStatus.WAITING_APPROVAL, "Member is already active or rejected");

        members[_member].memberStatus = MemberStatus.ACTIVE;
        emit MemberApproved(_member);
    }

    function rejectMemberRegistration(address _member) public onlyMembershipAdmin(msg.sender) {
        require(members[_member].memberId != address(0), "Member does not exist.");
        require(members[_member].memberStatus == MemberStatus.WAITING_APPROVAL, "Can not reject active or rejected member");

        uint256 paidAmount = membershipPricing[members[_member].memberType];
        (bool success,) = _member.call{value: paidAmount}("");
        require(success, "Refund failed");

        members[_member].memberStatus = MemberStatus.REJECTED;
        emit MemberRejected(_member, 0);
    }

    function setRegistrationFee(MembershipType _membershipType, uint256 _fee) public onlyMembershipAdmin(msg.sender) {
        membershipPricing[_membershipType] = _fee;
        emit UpdateMembershipFee(msg.sender, _fee);
    }

    function createNewEvent(string memory _eventName, uint256 _quota, uint256 _earlyAccessDays) public onlyEventAdmin(msg.sender) returns (bytes32) {
        require(_quota > 0, "Event must have a positive quota.");
        require(_earlyAccessDays > 0, "Early access duration must be positive.");

        bytes32 newEventId = generateEventId();

        events[newEventId] = Event({
            eventName: _eventName,
            quota: _quota,
            participants: 0,
            vipParticipants: 0,
            earlyAccessDurationInDays: _earlyAccessDays,
            earlyAccessStartTime: block.timestamp,
            status: EventStatus.ACTIVE
        });

        emit EventCreated(newEventId, _eventName, _quota, _earlyAccessDays);

        return newEventId;
    }

    function cancelEvent(bytes32 _eventId) public onlyEventAdmin(msg.sender) {
        require(events[_eventId].quota > 0, "Event does not exist.");
        require(events[_eventId].status == EventStatus.ACTIVE, "Event is already inactive");

        events[_eventId].status = EventStatus.INACTIVE;

        emit EventCancelled(_eventId);
    }

    function generateEventId() private view returns (bytes32) {
        return
            keccak256(
            abi.encodePacked(
                block.timestamp,
                msg.sender,
                block.prevrandao,
                blockhash(block.number - 1)
            )
        );
    }

    function registerToEvent(bytes32 _eventId) public {
        require(events[_eventId].status == EventStatus.ACTIVE, "Event is not active.");
        require(!eventRegistrations[msg.sender][_eventId], "You are already registered for this event.");
        require(events[_eventId].participants < events[_eventId].quota, "Event is full.");

        events[_eventId].participants++;
        eventRegistrations[msg.sender][_eventId] = true;

        emit EventRegistered(msg.sender, _eventId);
    }

    function addAdmin(address _admin, Role _role) public onlyOwner {
        require(admins[_admin].adminId == address(0), "Admin already registered with same address");
        admins[_admin] = Admin({
            adminId: _admin,
            role: _role
        });
    }

    function assignRole(address _member, Role _roleType) public onlyOwner {
        require(members[_member].memberId != address(0x0), "The member does not exist");
        members[_member].role = _roleType;
        emit RoleAssigned(_member, _roleType);
    }

    modifier onlyOwner() {
        require(isOwner(), "Not Authorized: Caller is not the owner");
        _;
    }

    function isOwner() public view returns (bool) {
        return msg.sender == owner;
    }

    modifier onlyMembershipAdmin(address _address) {
        require(isMembershipAdmin(_address) || isOwner(), "Not Authorized: Caller is not Membership Admin");
        _;
    }

    function isMembershipAdmin(address _user) public view returns (bool) {
        return admins[_user].role == Role.MEMBERSHIP_ADMIN;
    }

    modifier onlyEventAdmin(address _address) {
        require(isEventAdmin(_address) || isOwner(), "Not Authorized: Caller is not Event Admin");
        _;
    }

    function isEventAdmin(address _user) public view returns (bool) {
        return admins[_user].role == Role.EVENT_ADMIN;
    }
}
