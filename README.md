## Event Membership Management

Demo project to learn smart contract with solidity and hardhat.


Roles:
- Member
- Membership Admin
- Event Admin

Membership Type :
- Regular
- Gold
- VIP
- NA

Use case :
- Member/any wallet able to register ✅
- Each MembershipType will have different Eth for registration and should be paid with registrationFee ✅
- Membership will be activated once owner or Membership Admin approve the registration ✅
- Membership can be rejected by owner or Membership Admin and paid Eth will be refunded ✅
- Contract owner can manage who will be the Membership Admin and Event Admin
- Membership fee per tier can be updated by Owner or Membership Admin ✅
- Event Admin can create an event and cancel the event with attendee quota ✅
- Only member can register to an event and only if the quota is available ✅

Bonus :
- Add the membership duration
- 50% quota for early access VIP (earlyAccessDuration in struct eventDetails).
- If there is available quota other than the 50% early access VIP, can be shared to Regular and Gold member

Notes:
- Emit events, best practice if there is any state change ✅
- Create a test script ✅
- Use modifiers ✅
- Not use reserved keyword for variable name or struct ✅
