import { TezosToolkit, Signer, Wallet, ContractAbstraction } from "@taquito/taquito";
//import { Tzip12Module, tzip12, Tzip12ContractAbstraction } from "@taquito/tzip12";
import { Tzip16Module, tzip16, Tzip16ContractAbstraction } from "@taquito/tzip16";
import { RpcClientInterface } from "@taquito/rpc";
import BigNumber from "bignumber.js";

export interface IOperatorOpParams {
	owner: string,
	operator: string,
	token_id: number
}

const mutezFactor = 1000000;

export class Contract {
	private toolkit: TezosToolkit
	private contractAddr: string

	constructor(RPC_URL_or_TEZ_TOOLKIT: string, contractAddr: string, options: { signer: Signer })
	constructor(RPC_URL_or_TEZ_TOOLKIT: TezosToolkit, contractAddr: string, options?: {})
	constructor(RPC_URL_or_TEZ_TOOLKIT: string | TezosToolkit, contractAddr: string, options: { signer?: Signer } = {}) {
		if (typeof RPC_URL_or_TEZ_TOOLKIT === "string") {
			const toolkit = new TezosToolkit(RPC_URL_or_TEZ_TOOLKIT)
			//toolkit.addExtension(new Tzip12Module());
			toolkit.addExtension(new Tzip16Module());
			toolkit.setProvider({ signer: options.signer });
			if (typeof options !== "object") options = {};
			this.toolkit = toolkit
			this.contractAddr = contractAddr
			return
		}

		this.toolkit = RPC_URL_or_TEZ_TOOLKIT
		this.contractAddr = contractAddr
	}

	async get_contract(): Promise<ContractAbstraction<Wallet> & { /*tzip12: () => Tzip12ContractAbstraction,*/ tzip16: () => Tzip16ContractAbstraction }> {
		return await this.toolkit.wallet.at(this.contractAddr, tzip16 /* compose(tzip12, tzip16) */)
	}

	get Rpc(): RpcClientInterface {
		return this.toolkit.rpc
	}

	get Toolkit(): TezosToolkit {
		return this.toolkit
	}

	get ContractAddress() {
		return this.contractAddr
	}

	async get_contract_storage() {
		return (await this.get_contract()).storage()
	}

	async get_addr() {
		try {
			return await this.toolkit.wallet.pkh()
		} catch {
			return await this.toolkit.signer.publicKeyHash()
		}
	}

	async get_contract_balance(inTez: boolean) {
		const balance = await this.Rpc.getBalance(this.ContractAddress)
		return !inTez ? balance : balance.toNumber() / mutezFactor
	}

	async approve(depositorAddr: string) {
		const contract = await this.get_contract();
		return contract.methodsObject.approve(depositorAddr)
	}

	async refuse(depositorAddr: string) {
		const contract = await this.get_contract();
		return contract.methodsObject.refuse(depositorAddr)
	}

	async withdraw(amount: number, inTez: boolean) {
		const contract = await this.get_contract();
		if (inTez) {
			amount = Math.floor(amount * mutezFactor)
		}
		return contract.methodsObject.withdraw(amount)
	}

	async deposit(amount: number, inTez: boolean) {
		return this.toolkit.wallet.transfer({ to: this.ContractAddress, amount: amount, mutez: !inTez })
	}

	async get_shares(inTez: boolean) {
		const storage = await this.get_contract_storage()
		const shareStore = (storage as any).shares;
		const result: BigNumber | undefined = shareStore.get(await this.get_addr());
		const shares = result ?? new BigNumber(0);
		return !inTez ? shares : shares.toNumber() / mutezFactor
	}

	async is_approved() {
		const storage = await this.get_contract_storage() as any
		const shareRatesStore = storage.shareRates;
		const depositors = storage.depositors
		let numberOfVotesRequired = 0
		for await (const _ of shareRatesStore.keys()) {
			numberOfVotesRequired++;
		}
		const votes: BigNumber | undefined = await depositors.get(await this.get_addr())
		if (!votes) return false
		return votes.toNumber() === numberOfVotesRequired
	}
}