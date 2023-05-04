import test from "ava";
import { setup, BOB_ADDR, ALICE_ADDR } from "./base.mjs"

const mutezFactor = 1000000;

const refuseAddr = async (addr) => {
	const { alice, bob } = await setup();
	const members = [alice, bob]
	for (const member of members) {
		try {
			await (await member.refuse(addr)).confirmation(1);
		} catch (err) { }
	}
}

const approveAddr = async (addr) => {
	const { alice, bob } = await setup();
	const members = [alice, bob]
	for (const member of members) {
		try {
			await (await member.approve(addr)).confirmation();
		} catch (err) { }
	}
}

const get_shares = async (addr) => {
	const { alice } = await setup();

	const storage = await alice.get_contract_storage()
	const shares = storage.shares;
	const result = shares.get(addr)
	return result?.toNumber() ?? 0
}

test.serial("deposit (not approved)", async (t) => {
	const { alice, bob } = await setup();
	await refuseAddr(BOB_ADDR); // refuse by all
	const balance = (await alice.get_balance()).toNumber()
	try {
		const op = await alice.deposit(1000, false)
		await op.confirmation();
		t.true("should fail!")
	} catch (err) {
		t.true(err.toString().includes("not approved") || err.toString().includes("not enough approvals"))
	}

	try {
		const op = await bob.deposit(1000, false)
		await op.confirmation();
		t.true("should fail!")
	} catch (err) {
		t.true(err.toString().includes("not approved") || err.toString().includes("not enough approvals"))
	}
	t.is(balance, (await bob.get_balance()).toNumber())
});

test.serial("deposit (approved)", async (t) => {
	const { alice, bob } = await setup();
	await refuseAddr(BOB_ADDR); // refuse by all

	await (await alice.approve(BOB_ADDR)).confirmation(1);
	await (await bob.approve(BOB_ADDR)).confirmation(1)

	const balance = (await alice.get_balance()).toNumber()
	try {
		const op = await alice.deposit(1000, false)
		await op.confirmation(1);
		t.true("should fail!")
	} catch (err) {
		t.true(err.toString().includes("not approved"))
	}

	const aliceShares = await get_shares(ALICE_ADDR)
	const bobShares = await get_shares(BOB_ADDR)

	const op = await bob.deposit(1000, false)
	await op.confirmation(1);
	t.is(balance + 1000 * mutezFactor, (await bob.get_balance()).toNumber())

	t.is(await get_shares(ALICE_ADDR) - aliceShares, 850 * mutezFactor)
	t.is(await get_shares(BOB_ADDR) - bobShares, 150 * mutezFactor)
});


