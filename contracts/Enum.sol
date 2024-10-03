// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

    enum MembershipType {
        REGULAR,
        GOLD,
        VIP,
        NA
    }

    enum Role {
        MEMBER,
        MANAGER,
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

