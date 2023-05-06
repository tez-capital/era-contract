import test from "ava";
import { setup, BOB_ADDR, ALICE_ADDR, CHARLIE_ADDR } from "./base.mjs"

const mutezFactor = 1000000;

const refuseAddr = async (addr) => {
	const { alice, bob } = await setup();
	const members = [alice, bob]
	const promises = []
	for (const member of members) {
		promises.push((async () => {
			const op = await member.refuse(addr)
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
			const op = await member.approve(addr)
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

test.serial("approve", async (t) => {
	const { bob } = await setup();
	await cleanupApprovals();

	await (await bob.approve(CHARLIE_ADDR)).confirmation()
	const storage = await bob.get_contract_storage()
	const depositors = storage.depositors
	t.truthy(await depositors.get(CHARLIE_ADDR))
})

test.serial("approve (not a member)", async (t) => {
	const { charlie } = await setup();
	await cleanupApprovals();

	try {
		await (await charlie.approve(CHARLIE_ADDR)).confirmation()
	} catch (err) {
		t.true(err.toString().includes("not a member"))
	}
})

test.serial("approve (double)", async (t) => {
	const { bob } = await setup();
	await cleanupApprovals();

	await (await bob.approve(CHARLIE_ADDR)).confirmation()
	try {
		await (await bob.approve(CHARLIE_ADDR)).confirmation()
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
	const op2 = await charlie.deposit(100, true)
	await op2.confirmation();
	t.is(balance + 100 * mutezFactor, (await bob.get_contract_balance()).toNumber())

	await (await bob.refuse(CHARLIE_ADDR)).confirmation()
	try {
		const op = await charlie.deposit(1000, true)
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
		await (await charlie.approve(CHARLIE_ADDR)).confirmation()
		t.true("should fail")
	} catch (err) {
		t.true(err.toString().includes("not a member"))
	}
})

test.serial("refuse (double)", async (t) => {
	const { bob } = await setup();
	await cleanupApprovals();

	try {
		await (await bob.refuse(CHARLIE_ADDR)).confirmation()
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
		const op = await alice.deposit(1000, true)
		await op.confirmation();
		t.true("should fail!")
	} catch (err) {
		t.true(err.toString().includes("not approved") || err.toString().includes("not enough approvals"))
	}

	try {
		const op = await bob.deposit(1000, true)
		await op.confirmation();
		t.true("should fail!")
	} catch (err) {
		t.true(err.toString().includes("not approved") || err.toString().includes("not enough approvals"))
	}

	try {
		const op = await charlie.deposit(1000, true)
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
		const op = await alice.deposit(1000, true)
		await op.confirmation();
		t.true("should fail!")
	} catch (err) {
		t.true(err.toString().includes("not approved"))
	}

	// bob deposit
	let aliceShares = await alice.get_shares()
	let bobShares = await bob.get_shares()

	const op = await bob.deposit(1000, true)
	await op.confirmation();
	t.is(balance + 1000 * mutezFactor, (await bob.get_contract_balance()).toNumber())

	t.is(await alice.get_shares() - aliceShares, 850 * mutezFactor)
	t.is(await bob.get_shares() - bobShares, 150 * mutezFactor)

	try {
		const op = await charlie.deposit(1000, true)
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
	const op2 = await charlie.deposit(100, true)
	await op2.confirmation();
	t.is(balance + 100 * mutezFactor, (await bob.get_contract_balance()).toNumber())

	t.is(await alice.get_shares() - aliceShares, 85 * mutezFactor)
	t.is(await bob.get_shares() - bobShares, 15 * mutezFactor)
});

test.serial("withdraw", async (t) => {
	const { bob, charlie } = await setup();
	await cleanupApprovals();
	await approveAddr(CHARLIE_ADDR)

	const op2 = await charlie.deposit(100, true)
	await op2.confirmation();

	const bobBalance = await bob.Rpc.getBalance(await bob.get_addr())
	const op = await bob.withdraw(15, true)
	await op.confirmation()
	t.true(await bob.Rpc.getBalance(await bob.get_addr()) > bobBalance + 14 * mutezFactor)
})

test.serial("withdraw (not a member)", async (t) => {
	const { alice, bob, charlie } = await setup();
	await cleanupApprovals();

	try {
		await (await charlie.withdraw(100, true)).confirmation()
		t.true("should fail")
	} catch (err) {
		t.true(err.toString().includes("not a member"))
	}
})

test.serial("withdraw (over limit)", async (t) => {
	const { bob } = await setup();
	await cleanupApprovals();
	const shares = await bob.get_shares(true)

	try {
		await (await bob.withdraw(shares + 1, true)).confirmation()
		t.true("should fail")
	} catch (err) {
		t.true(err.toString().includes("available amount exceeded"))
	}
})
