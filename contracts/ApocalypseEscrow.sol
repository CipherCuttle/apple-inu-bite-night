// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @title ApocalypseEscrow
/// @notice Minimal escrow for deterministic game contracts.
/// @dev V0 intentionally leaves gameplay verification off-chain. The immutable verifier
///      may settle only an already-accepted contract with an opaque replay receipt hash.
contract ApocalypseEscrow {
    enum Status {
        Open,
        Accepted,
        Paid,
        Refunded
    }

    struct ContractData {
        address sponsor;
        address runner;
        bytes32 termsHash;
        bytes32 receiptHash;
        uint96 reward;
        uint64 deadline;
        Status status;
    }

    error InvalidVerifier();
    error InvalidReward();
    error InvalidDeadline();
    error ContractNotOpen();
    error ContractNotAccepted();
    error ContractExpired();
    error ContractNotExpired();
    error SponsorCannotAccept();
    error NotVerifier();
    error NotSponsor();
    error TransferFailed();

    address public immutable verifier;
    uint256 public nextContractId = 1;
    mapping(uint256 => ContractData) public contracts;

    event ContractCreated(
        uint256 indexed contractId,
        address indexed sponsor,
        bytes32 indexed termsHash,
        uint256 reward,
        uint64 deadline
    );
    event ContractAccepted(uint256 indexed contractId, address indexed runner);
    event ContractPaid(uint256 indexed contractId, address indexed runner, bytes32 indexed receiptHash, uint256 reward);
    event ContractRefunded(uint256 indexed contractId, address indexed sponsor, uint256 reward);

    constructor(address verifier_) {
        if (verifier_ == address(0)) revert InvalidVerifier();
        verifier = verifier_;
    }

    function createContract(bytes32 termsHash, uint64 deadline) external payable returns (uint256 contractId) {
        if (msg.value == 0 || msg.value > type(uint96).max) revert InvalidReward();
        if (deadline <= block.timestamp) revert InvalidDeadline();

        contractId = nextContractId++;
        contracts[contractId] = ContractData({
            sponsor: msg.sender,
            runner: address(0),
            termsHash: termsHash,
            receiptHash: bytes32(0),
            reward: uint96(msg.value),
            deadline: deadline,
            status: Status.Open
        });

        emit ContractCreated(contractId, msg.sender, termsHash, msg.value, deadline);
    }

    function acceptContract(uint256 contractId) external {
        ContractData storage contractData = contracts[contractId];
        if (contractData.status != Status.Open) revert ContractNotOpen();
        if (block.timestamp >= contractData.deadline) revert ContractExpired();
        if (msg.sender == contractData.sponsor) revert SponsorCannotAccept();

        contractData.runner = msg.sender;
        contractData.status = Status.Accepted;
        emit ContractAccepted(contractId, msg.sender);
    }

    function settleSuccess(uint256 contractId, bytes32 receiptHash) external {
        if (msg.sender != verifier) revert NotVerifier();

        ContractData storage contractData = contracts[contractId];
        if (contractData.status != Status.Accepted) revert ContractNotAccepted();

        uint256 reward = contractData.reward;
        address runner = contractData.runner;
        contractData.receiptHash = receiptHash;
        contractData.status = Status.Paid;
        contractData.reward = 0;

        (bool sent, ) = payable(runner).call{value: reward}("");
        if (!sent) revert TransferFailed();

        emit ContractPaid(contractId, runner, receiptHash, reward);
    }

    function refundExpired(uint256 contractId) external {
        ContractData storage contractData = contracts[contractId];
        if (msg.sender != contractData.sponsor) revert NotSponsor();
        if (contractData.status != Status.Open && contractData.status != Status.Accepted) revert ContractNotOpen();
        if (block.timestamp < contractData.deadline) revert ContractNotExpired();

        uint256 reward = contractData.reward;
        address sponsor = contractData.sponsor;
        contractData.status = Status.Refunded;
        contractData.reward = 0;

        (bool sent, ) = payable(sponsor).call{value: reward}("");
        if (!sent) revert TransferFailed();

        emit ContractRefunded(contractId, sponsor, reward);
    }
}
