import fs from "fs/promises";

import { InMemorySigner } from "@taquito/signer";
import { Contract } from "../dist/cjs/index.js"
import { parse } from "hjson"
import { get } from "lodash-es"
const appHjson = parse((await fs.readFile("../app.hjson")).toString())

const ALICE_KEY = "edsk3QoqBuvdamxouPhin7swCvkQNgq4jP5KZPbwWNnwdZpSpJiEbq"
const BOB_KEY = "edsk3RFfvaFaxbHx8BMtEW1rKQcPtDML3LXjNqMNLCzC3wLC1bWbAt"
const RPC_URL = `http://localhost:${get(appHjson, "sandbox.rpc_port", 20000)}`

export const ALICE_ADDR = "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb"
export const BOB_ADDR = "tz1aSkwEot3L2kmUvcoxzjMomb9mvBNuzFK6"

export const setup = async () => {
	const id = appHjson.id
	const { contractAddress } = JSON.parse(
		(await fs.readFile(`../deploy/sandbox-${id}.json`)).toString()
	);
	const alice = new Contract(RPC_URL, contractAddress, { test: true, signer: await InMemorySigner.fromSecretKey(ALICE_KEY) });
	const bob = new Contract(RPC_URL, contractAddress, { test: true, signer: await InMemorySigner.fromSecretKey(BOB_KEY) });
	return { bob, alice, contractAddress }
};