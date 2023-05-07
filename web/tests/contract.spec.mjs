import test from "ava";
import { setup, BOB_ADDR, ALICE_ADDR, CHARLIE_ADDR } from "./base.mjs"

const mutezFactor = 1000000;

const refuseAddr = async (addr) => {
	const { alice, bob } = await setup();
	const members = [alice, bob]
	const promises = []
	for (const member of members) {
		promises.push((async () => {
			const op = await (await member.refuse(addr)).send()
			await op.confirmation()
		})());
	}
	await Promise.allSettled(promises)
}

const cleanupApprovals = async () => {
	// can not run in parallel
	await refuseAddr(BOB_ADDR)
	await refuseAddr(ALICE_ADDR)
	await refuseAddr(CHARLIE_ADDR)
}

const approveAddr = async (addr) => {
	const { alice, bob } = await setup();
	const members = [alice, bob]
	const promises = []
	for (const member of members) {
		promises.push((async () => {
			const cmo = await member.approve(addr)
			const op = await cmo.send({
				// slightly increased limits because of storage state varies based on number of votes
				// while refuse can burn only less than is estimate, approve may require more
				storageLimit: 200,
				gasLimit: 4000
			})
			await op.confirmation()
		})());
	}
	await Promise.all(promises)
}

const get_shares = async (addr) => {
	const { alice } = await setup();

	const storage = await alice.get_contract_storage()
	const shares = storage.shares;
	const result = shares.get(addr)
	return result?.toNumber() ?? 0
}

const get_approvals = async (addr) => {
	const { bob } = await setup();
	const storage = await bob.get_contract_storage()
	const depositors = storage.depositors
	const depositor = await depositors.get(addr)
	return depositor.toNumber()
}

test.serial("prepare", async (t) => {
	const { bob } = await setup();
	await (await bob.Toolkit.wallet.transfer({ to: CHARLIE_ADDR, amount: 1000 }).send()).confirmation()
	t.true(true)
})

test.serial("approve", async (t) => {
	const { bob } = await setup();
	await cleanupApprovals();

	await (await (await bob.approve(CHARLIE_ADDR)).send()).confirmation()
	const storage = await bob.get_contract_storage()
	const depositors = storage.depositors
	t.truthy(await depositors.get(CHARLIE_ADDR))
})

test.serial("approve (not a member)", async (t) => {
	const { charlie } = await setup();
	await cleanupApprovals();

	try {
		await (await (await charlie.approve(CHARLIE_ADDR)).send()).confirmation()
	} catch (err) {
		t.true(err.toString().includes("not a member"))
	}
})

test.serial("approve (double)", async (t) => {
	const { bob } = await setup();
	await cleanupApprovals();

	await (await (await bob.approve(CHARLIE_ADDR)).send()).confirmation()
	try {
		await (await (await bob.approve(CHARLIE_ADDR)).send()).confirmation()
		t.true("should fail")
	} catch (err) {
		t.true(err.toString().includes("existing vote found"))
	}
})

test.serial("refuse", async (t) => {
	const { alice, bob, charlie } = await setup();
	await cleanupApprovals();

	await approveAddr(CHARLIE_ADDR)

	const balance = (await alice.get_contract_balance()).toNumber()
	const op2 = await (await charlie.deposit(100, true)).send()
	await op2.confirmation();
	t.is(balance + 100 * mutezFactor, (await bob.get_contract_balance()).toNumber())

	await (await (await bob.refuse(CHARLIE_ADDR)).send()).confirmation()
	try {
		const op = await (await charlie.deposit(100, true)).send()
		await op.confirmation();
		t.true("should fail!")
	} catch (err) {
		t.true(err.toString().includes("not approved") || err.toString().includes("not enough approvals"))
	}
	t.is(balance + 100 * mutezFactor, (await bob.get_contract_balance()).toNumber())
})

test.serial("refuse (not a member)", async (t) => {
	const { charlie } = await setup();
	await cleanupApprovals();

	try {
		await (await (await charlie.approve(CHARLIE_ADDR)).send()).confirmation()
		t.true("should fail")
	} catch (err) {
		t.true(err.toString().includes("not a member"))
	}
})

test.serial("refuse (double)", async (t) => {
	const { bob } = await setup();
	await cleanupApprovals();

	try {
		await (await (await bob.refuse(CHARLIE_ADDR)).send()).confirmation()
		t.true("should fail!")
	} catch (err) {
		t.true(err.toString().includes("not approved") || err.toString().includes("vote not found"))
	}
})

test.serial("deposit (not approved)", async (t) => {
	const { alice, bob, charlie } = await setup();
	await cleanupApprovals();
	const balance = (await alice.get_contract_balance()).toNumber()
	try {
		const op = await (await alice.deposit(1000, true)).send()
		await op.confirmation();
		t.true("should fail!")
	} catch (err) {
		t.true(err.toString().includes("not approved") || err.toString().includes("not enough approvals"))
	}

	try {
		const op = await (await bob.deposit(1000, true)).send()
		await op.confirmation();
		t.true("should fail!")
	} catch (err) {
		t.true(err.toString().includes("not approved") || err.toString().includes("not enough approvals"))
	}

	try {
		const op = await (await charlie.deposit(100, true)).send()
		await op.confirmation();
		t.true("should fail!")
	} catch (err) {
		t.true(err.toString().includes("not approved") || err.toString().includes("not enough approvals"))
	}
	t.is(balance, (await bob.get_contract_balance()).toNumber())
});

test.serial("deposit (approved)", async (t) => {
	const { alice, bob, charlie } = await setup();
	await cleanupApprovals();

	await approveAddr(BOB_ADDR)

	let balance = (await alice.get_contract_balance()).toNumber()
	try {
		const op = await (await alice.deposit(1000, true)).send()
		await op.confirmation();
		t.true("should fail!")
	} catch (err) {
		t.true(err.toString().includes("not approved"))
	}

	// bob deposit
	let aliceShares = await alice.get_shares()
	let bobShares = await bob.get_shares()

	const op = await (await bob.deposit(1000, true)).send()
	await op.confirmation();
	t.is(balance + 1000 * mutezFactor, (await bob.get_contract_balance()).toNumber())

	t.is(await alice.get_shares() - aliceShares, 850 * mutezFactor)
	t.is(await bob.get_shares() - bobShares, 150 * mutezFactor)

	try {
		const op = await (await charlie.deposit(100, true)).send()
		await op.confirmation();
		t.true("should fail!")
	} catch (err) {
		t.true(err.toString().includes("not approved") || err.toString().includes("not enough approvals"))
	}
	// charlie deposit
	balance = (await alice.get_contract_balance()).toNumber()
	aliceShares = await alice.get_shares()
	bobShares = await bob.get_shares()

	await approveAddr(CHARLIE_ADDR)
	const op2 = await (await charlie.deposit(100, true)).send()
	await op2.confirmation();
	t.is(balance + 100 * mutezFactor, (await bob.get_contract_balance()).toNumber())

	t.is(await alice.get_shares() - aliceShares, 85 * mutezFactor)
	t.is(await bob.get_shares() - bobShares, 15 * mutezFactor)
});

test.serial("withdraw", async (t) => {
	const { bob, charlie } = await setup();
	await cleanupApprovals();
	await approveAddr(CHARLIE_ADDR)

	const op2 = await (await charlie.deposit(100, true)).send()
	await op2.confirmation();

	const bobBalance = await bob.Rpc.getBalance(await bob.get_addr())
	const op = await (await bob.withdraw(15, true)).send()
	await op.confirmation()
	t.true(await bob.Rpc.getBalance(await bob.get_addr()) > bobBalance + 14 * mutezFactor)
})

test.serial("withdraw (not a member)", async (t) => {
	const { charlie } = await setup();
	await cleanupApprovals();

	try {
		await (await (await charlie.withdraw(100, true)).send()).confirmation()
		t.true("should fail")
	} catch (err) {
		t.true(err.toString().includes("not a member"))
	}
})

test.serial("withdraw (max)", async (t) => {
	const { alice, charlie } = await setup();
	await cleanupApprovals();
	const balance = (await alice.get_contract_balance()).toNumber()

	await approveAddr(CHARLIE_ADDR)
	const op2 = await (await charlie.deposit(100, true)).send()
	await op2.confirmation();
	t.is(balance + 100 * mutezFactor, (await alice.get_contract_balance()).toNumber())
	const shares = (await alice.get_shares()).toNumber()

	const aliceBalance = await (await alice.Rpc.getBalance(await alice.get_addr())).toNumber()
	await (await (await alice.withdraw(shares)).send()).confirmation()
	t.true((aliceBalance + shares - mutezFactor) < (await alice.Rpc.getBalance(await alice.get_addr())).toNumber())
	t.is((await alice.get_shares()).toNumber(), 0)
})

test.serial("withdraw (over limit)", async (t) => {
	const { bob } = await setup();
	await cleanupApprovals();
	const shares = await bob.get_shares(true)

	try {
		await (await (await bob.withdraw(shares + 1, true)).send()).confirmation()
		t.true("should fail")
	} catch (err) {
		t.true(err.toString().includes("available amount exceeded"))
	}
})
