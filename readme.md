## ERA Contract

The ERA contract is a decentralized solution for managing funds deposited by approved entities among a group of independent members who have predefined, fixed share levels. The funds deposited into the contract are automatically split according to the share ratios of the members. The contract ensures that only depositors approved by all members can deposit funds.

### Testing

This contract is end-to-end tested using flextesa.

1. Compile the contract by running the `ami compile` command.
2. Start the local Tezos sandbox by running the `ami sandbox start` command.
3. Deploy the contract to the sandbox environment using the `ami deploy sandbox` command.
4. Run `ami test-js`

### Directory Structure
- `src/` contains the source code for the contract.
- `web/`contains the files for the web interface of the contract
