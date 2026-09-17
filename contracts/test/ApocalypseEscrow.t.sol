// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "../ApocalypseEscrow.sol";

interface Vm {
    function deal(address who, uint256 newBalance) external;
    function prank(address msgSender) external;
    function warp(uint256 newTimestamp) external;
}

contract ApocalypseEscrowTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    ApocalypseEscrow private escrow;
    address private constant SPONSOR = address(0xA11CE);
    address private constant RUNNER = address(0xB0B);
    address private constant ATTACKER = address(0xBAD);

    receive() external payable {}

    function setUp() public {
        escrow = new ApocalypseEscrow(address(this));
        vm.deal(SPONSOR, 10 ether);
        vm.deal(RUNNER, 1 ether);
        vm.deal(ATTACKER, 1 ether);
    }

    function testSuccessPathPaysAcceptedRunner() public {
        uint256 id = createAndAccept(1 ether, bytes32("terms-v0"));
        uint256 beforeBalance = RUNNER.balance;
        bytes32 receiptHash = keccak256("verified-replay-receipt");

        escrow.settleSuccess(id, receiptHash);

        (, address runner, , bytes32 storedReceipt, uint96 reward, , ApocalypseEscrow.Status status) = escrow.contracts(id);
        require(runner == RUNNER, "wrong runner");
        require(storedReceipt == receiptHash, "wrong receipt");
        require(reward == 0, "reward not consumed");
        require(status == ApocalypseEscrow.Status.Paid, "not paid");
        require(RUNNER.balance == beforeBalance + 1 ether, "runner not paid");
    }

    function testNonVerifierCannotSettle() public {
        uint256 id = createAndAccept(1 ether, bytes32("terms-v0"));

        vm.prank(ATTACKER);
        (bool ok, ) = address(escrow).call(
            abi.encodeCall(ApocalypseEscrow.settleSuccess, (id, keccak256("forged")))
        );

        require(!ok, "unauthorized verifier settled");
        (, , , , uint96 reward, , ApocalypseEscrow.Status status) = escrow.contracts(id);
        require(reward == 1 ether, "reward moved");
        require(status == ApocalypseEscrow.Status.Accepted, "status changed");
    }

    function testSponsorCanRefundOnlyAfterDeadline() public {
        vm.prank(SPONSOR);
        uint256 id = escrow.createContract{value: 1 ether}(bytes32("terms-v0"), uint64(block.timestamp + 10));
        uint256 balanceAfterFunding = SPONSOR.balance;

        vm.prank(SPONSOR);
        (bool earlyOk, ) = address(escrow).call(abi.encodeCall(ApocalypseEscrow.refundExpired, (id)));
        require(!earlyOk, "early refund succeeded");

        vm.warp(block.timestamp + 11);
        vm.prank(SPONSOR);
        escrow.refundExpired(id);

        (, , , , uint96 reward, , ApocalypseEscrow.Status status) = escrow.contracts(id);
        require(reward == 0, "reward not cleared");
        require(status == ApocalypseEscrow.Status.Refunded, "not refunded");
        require(SPONSOR.balance == balanceAfterFunding + 1 ether, "sponsor not refunded");
    }

    function createAndAccept(uint256 reward, bytes32 termsHash) private returns (uint256 id) {
        vm.prank(SPONSOR);
        id = escrow.createContract{value: reward}(termsHash, uint64(block.timestamp + 1 days));
        vm.prank(RUNNER);
        escrow.acceptContract(id);
    }
}
