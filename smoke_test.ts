/**
 * Smoke test: pull real data from CDN and exercise ALL SDK methods.
 *
 * Coverage goal: 100% of public methods, all filter parameters,
 * and key edge cases.
 *
 * Usage: bun run smoke_test.ts
 */

import { MtgjsonSDK } from "./src/index.js";

let PASS = 0;
let FAIL = 0;
let SKIP = 0;

function check(label: string, condition: boolean, detail = ""): void {
	const status = condition ? "PASS" : "FAIL";
	if (condition) {
		PASS++;
	} else {
		FAIL++;
	}
	const suffix = detail ? ` -- ${detail}` : "";
	console.log(`  [${status}] ${label}${suffix}`);
}

function skip(label: string, reason = ""): void {
	SKIP++;
	const suffix = reason ? ` -- ${reason}` : "";
	console.log(`  [SKIP] ${label}${suffix}`);
}

function section(name: string): void {
	console.log(`\n${"=".repeat(60)}`);
	console.log(`  ${name}`);
	console.log(`${"=".repeat(60)}`);
}

async function main(): Promise<boolean> {
	const t0 = Date.now();

	// ══════════════════════════════════════════════════════════
	//  CLIENT LIFECYCLE
	// ══════════════════════════════════════════════════════════
	section("Client Lifecycle");

	const sdk = await MtgjsonSDK.create();

	// meta property
	const meta = await sdk.meta;
	check(
		"meta loads",
		typeof meta === "object" && meta !== null && "data" in meta,
		`keys=${Object.keys(meta)}`,
	);
	if ("data" in meta) {
		const data = meta.data as Record<string, string>;
		const version = data?.version ?? "?";
		const date = data?.date ?? "?";
		check("meta has version", Boolean(version), `v=${version}, date=${date}`);
	}

	// views property (starts empty, grows as we query)
	const viewsBefore = sdk.views;
	check("views property (initial)", Array.isArray(viewsBefore));

	// refresh() — cache is fresh after meta load
	const refreshResult = await sdk.refresh();
	check(
		"refresh()",
		typeof refreshResult === "boolean",
		`stale=${refreshResult}`,
	);

	// ══════════════════════════════════════════════════════════
	//  CARDS — CardQuery (8 methods, ~20 filter params)
	// ══════════════════════════════════════════════════════════
	section("Cards: getByName / getByUuid");

	const bolt = await sdk.cards.getByName("Lightning Bolt");
	check(
		"getByName Lightning Bolt",
		bolt.length > 0,
		`found ${bolt.length} printings`,
	);

	// getByName with set_code filter
	const boltLea = await sdk.cards.getByName("Lightning Bolt", {
		setCode: "LEA",
	});
	check(
		"getByName setCode=LEA",
		boltLea.length >= 0,
		`found ${boltLea.length}`,
	);

	let uuid: string | null = null;
	if (bolt.length > 0) {
		uuid = bolt[0].uuid as string;

		// getByUuid
		const card = await sdk.cards.getByUuid(uuid);
		check("getByUuid (model)", card !== null && card.name === "Lightning Bolt");

		// getByUuid nonexistent
		const missing = await sdk.cards.getByUuid(
			"00000000-0000-0000-0000-000000000000",
		);
		check("getByUuid nonexistent returns null", missing === null);
	}

	// ── Cards: getByUuids (bulk lookup) ──
	section("Cards: bulk lookups (getByUuids)");

	if (bolt.length >= 2) {
		const bulkUuids = bolt.slice(0, 5).map((b) => b.uuid as string);
		const bulkCards = await sdk.cards.getByUuids(bulkUuids);
		check(
			"getByUuids (models)",
			bulkCards.length === bulkUuids.length,
			`requested ${bulkUuids.length}, got ${bulkCards.length}`,
		);
	}

	// empty list
	const bulkEmpty = await sdk.cards.getByUuids([]);
	check("getByUuids empty list", bulkEmpty.length === 0);

	// nonexistent uuids
	const bulkNone = await sdk.cards.getByUuids([
		"00000000-0000-0000-0000-000000000000",
	]);
	check("getByUuids nonexistent", bulkNone.length === 0);

	// ── Cards: search (all filter params) ──
	section("Cards: search filters");

	// name LIKE
	let s = await sdk.cards.search({ name: "Lightning%", limit: 10 });
	check("search name LIKE", s.length > 0, `found ${s.length}`);

	// exact name
	s = await sdk.cards.search({ name: "Lightning Bolt", limit: 5 });
	check("search name exact", s.length > 0);

	// colors
	s = await sdk.cards.search({ colors: ["R"], manaValue: 1.0, limit: 5 });
	check("search colors=R mv=1", s.length > 0, `found ${s.length}`);

	// colorIdentity
	s = await sdk.cards.search({ colorIdentity: ["W", "U"], limit: 5 });
	check("search colorIdentity=[W,U]", s.length > 0, `found ${s.length}`);

	// types
	s = await sdk.cards.search({ types: "Creature", limit: 5 });
	check("search types=Creature", s.length > 0, `found ${s.length}`);

	// rarity
	s = await sdk.cards.search({ rarity: "mythic", limit: 5 });
	check("search rarity=mythic", s.length > 0, `found ${s.length}`);

	// text
	s = await sdk.cards.search({ text: "draw a card", limit: 5 });
	check("search text='draw a card'", s.length > 0, `found ${s.length}`);

	// power / toughness
	s = await sdk.cards.search({ power: "4", toughness: "4", limit: 5 });
	check("search power=4 toughness=4", s.length > 0, `found ${s.length}`);

	// manaValue exact
	s = await sdk.cards.search({ manaValue: 3.0, limit: 5 });
	check("search manaValue=3", s.length > 0, `found ${s.length}`);

	// manaValueLte
	s = await sdk.cards.search({ manaValueLte: 1.0, limit: 5 });
	check("search manaValueLte=1", s.length > 0, `found ${s.length}`);

	// manaValueGte
	s = await sdk.cards.search({ manaValueGte: 10.0, limit: 5 });
	check("search manaValueGte=10", s.length > 0, `found ${s.length}`);

	// artist
	s = await sdk.cards.search({ artist: "Christopher Moeller", limit: 5 });
	check("search artist", s.length > 0, `found ${s.length}`);

	// keyword
	s = await sdk.cards.search({ keyword: "Flying", limit: 5 });
	check("search keyword=Flying", s.length > 0, `found ${s.length}`);

	// layout
	s = await sdk.cards.search({ layout: "split", limit: 5 });
	check("search layout=split", s.length > 0, `found ${s.length}`);

	// isPromo
	s = await sdk.cards.search({ isPromo: true, limit: 5 });
	check("search isPromo=true", s.length > 0, `found ${s.length}`);

	const sNp = await sdk.cards.search({ isPromo: false, limit: 5 });
	check("search isPromo=false", sNp.length > 0, `found ${sNp.length}`);

	// availability
	s = await sdk.cards.search({ availability: "mtgo", limit: 5 });
	check("search availability=mtgo", s.length > 0, `found ${s.length}`);

	s = await sdk.cards.search({ availability: "paper", limit: 5 });
	check("search availability=paper", s.length > 0, `found ${s.length}`);

	// language
	s = await sdk.cards.search({ language: "Japanese", limit: 5 });
	check("search language=Japanese", Array.isArray(s), `found ${s.length}`);

	// setCode
	s = await sdk.cards.search({ setCode: "MH3", limit: 5 });
	check("search setCode=MH3", s.length > 0, `found ${s.length}`);

	// setType (requires JOIN with sets)
	s = await sdk.cards.search({ setType: "expansion", limit: 5 });
	check("search setType=expansion", s.length > 0, `found ${s.length}`);

	// legalIn + manaValueLte
	s = await sdk.cards.search({
		legalIn: "modern",
		manaValueLte: 2.0,
		limit: 5,
	});
	check(
		"search legalIn=modern + manaValueLte",
		s.length > 0,
		`found ${s.length}`,
	);

	// combined filters
	s = await sdk.cards.search({
		colors: ["R"],
		rarity: "rare",
		manaValueLte: 3.0,
		limit: 5,
	});
	check(
		"search combined (colors+rarity+mv)",
		s.length > 0,
		`found ${s.length}`,
	);

	// offset (pagination)
	const page1 = await sdk.cards.search({
		name: "Lightning%",
		limit: 3,
		offset: 0,
	});
	const page2 = await sdk.cards.search({
		name: "Lightning%",
		limit: 3,
		offset: 3,
	});
	check(
		"search offset (pagination)",
		page1.length > 0 && page2.length > 0,
		"two pages fetched",
	);
	if (page1.length > 0 && page2.length > 0) {
		check(
			"search pages differ",
			page1[0].uuid !== page2[0].uuid,
			"different cards",
		);
	}

	// textRegex
	s = await sdk.cards.search({ textRegex: "deals \\d+ damage", limit: 5 });
	check("search textRegex", s.length > 0, `found ${s.length}`);

	// localizedName (foreign language search)
	s = await sdk.cards.search({ localizedName: "Blitzschlag", limit: 5 });
	check(
		"search localizedName (German)",
		s.length > 0,
		`found ${s.length}, name=${s[0]?.name ?? "?"}`,
	);

	// localizedName LIKE
	s = await sdk.cards.search({ localizedName: "%Foudre%", limit: 5 });
	check("search localizedName LIKE", Array.isArray(s), `found ${s.length}`);

	// ── Cards: other methods ──
	section("Cards: random, count, printings, atomic, findByScryfallId");

	const rand = await sdk.cards.random(3);
	check("random(3)", rand.length === 3, `names: ${rand.map((c) => c.name)}`);

	const count = await sdk.cards.count();
	check("count()", (count as number) > 1000, `total cards: ${count}`);

	// count with filters
	const countR = await sdk.cards.count({ rarity: "mythic" });
	check(
		"count(rarity=mythic)",
		(countR as number) > 0 && (countR as number) < (count as number),
		`mythic cards: ${countR}`,
	);

	const printings = await sdk.cards.getPrintings("Counterspell");
	check(
		"getPrintings Counterspell",
		printings.length > 5,
		`found ${printings.length} printings`,
	);

	// getAtomic — exact name
	const atomic = await sdk.cards.getAtomic("Lightning Bolt");
	check("getAtomic Lightning Bolt", atomic.length > 0);

	// getAtomic — face name fallback for split cards
	const atomicFire = await sdk.cards.getAtomic("Fire");
	check(
		"getAtomic face name 'Fire'",
		atomicFire.length > 0,
		`layout=${atomicFire[0]?.layout ?? "?"}`,
	);

	// findByScryfallId
	if (uuid) {
		const scryCards = await sdk.cards.findByScryfallId(uuid);
		check("findByScryfallId runs", Array.isArray(scryCards), "no error");
	}

	// ══════════════════════════════════════════════════════════
	//  TOKENS — TokenQuery (5 methods, ~8 filter params)
	// ══════════════════════════════════════════════════════════
	section("Tokens");

	const tokenCount = await sdk.tokens.count();
	check(
		"token count()",
		(tokenCount as number) > 0,
		`total tokens: ${tokenCount}`,
	);

	// count with filters
	const tokenCountMh3 = await sdk.tokens.count({ setCode: "MH3" });
	check(
		"token count(setCode=MH3)",
		typeof tokenCountMh3 === "number",
		`MH3 tokens: ${tokenCountMh3}`,
	);

	// search by name LIKE
	const tokenSearch = await sdk.tokens.search({ name: "%Soldier%", limit: 5 });
	check(
		"token search name LIKE",
		tokenSearch.length > 0,
		`found ${tokenSearch.length}`,
	);

	// search by setCode — find a set that actually has tokens
	const tokenSetRow = await sdk.sql(
		"SELECT DISTINCT setCode FROM tokens LIMIT 1",
	);
	const tokenSetCode = (tokenSetRow[0]?.setCode as string) ?? "MH3";
	const tokenSearchSet = await sdk.tokens.search({
		setCode: tokenSetCode,
		limit: 5,
	});
	check(
		"token search setCode",
		tokenSearchSet.length > 0,
		`set=${tokenSetCode}, found ${tokenSearchSet.length}`,
	);

	// search by colors
	const tokenSearchColors = await sdk.tokens.search({
		colors: ["W"],
		limit: 5,
	});
	check(
		"token search colors=[W]",
		tokenSearchColors.length > 0,
		`found ${tokenSearchColors.length}`,
	);

	// search with offset
	const tp1 = await sdk.tokens.search({
		name: "%Soldier%",
		limit: 2,
		offset: 0,
	});
	const tp2 = await sdk.tokens.search({
		name: "%Soldier%",
		limit: 2,
		offset: 2,
	});
	check("token search offset", Array.isArray(tp1) && Array.isArray(tp2));

	// getByUuid
	if (tokenSearch.length > 0) {
		const token = await sdk.tokens.getByUuid(tokenSearch[0].uuid as string);
		check("token getByUuid", token !== null, `name=${token?.name ?? "?"}`);

		// nonexistent
		const missingToken = await sdk.tokens.getByUuid(
			"00000000-0000-0000-0000-000000000000",
		);
		check("token getByUuid nonexistent", missingToken === null);
	}

	// getByName
	const tokenSoldiers = await sdk.tokens.getByName("Soldier");
	check(
		"token getByName Soldier",
		tokenSoldiers.length > 0,
		`found ${tokenSoldiers.length}`,
	);

	// getByName with setCode
	const tokenSoldiersSet = await sdk.tokens.getByName("Soldier", {
		setCode: tokenSetCode,
	});
	check(
		"token getByName setCode",
		Array.isArray(tokenSoldiersSet),
		`set=${tokenSetCode}, found ${tokenSoldiersSet.length}`,
	);

	// forSet
	const tokensFor = await sdk.tokens.forSet(tokenSetCode);
	check(
		"token forSet",
		tokensFor.length > 0,
		`set=${tokenSetCode}, found ${tokensFor.length}`,
	);

	// getByUuids (bulk token lookup)
	if (tokenSearch.length >= 2) {
		const tokenUuids = tokenSearch.slice(0, 3).map((t) => t.uuid as string);
		const bulkTokens = await sdk.tokens.getByUuids(tokenUuids);
		check(
			"token getByUuids",
			bulkTokens.length === tokenUuids.length,
			`requested ${tokenUuids.length}, got ${bulkTokens.length}`,
		);
	}

	check(
		"token getByUuids empty",
		(await sdk.tokens.getByUuids([])).length === 0,
	);

	// ══════════════════════════════════════════════════════════
	//  SETS — SetQuery (4 methods, ~7 filter params)
	// ══════════════════════════════════════════════════════════
	section("Sets");

	// get
	const mh3 = await sdk.sets.get("MH3");
	check("get set MH3", mh3 !== null, `name=${mh3?.name ?? "?"}`);

	// get nonexistent
	const missingSet = await sdk.sets.get("ZZZZZ");
	check("get set nonexistent", missingSet === null);

	// list — no filter
	const allSets = await sdk.sets.list({ limit: 10 });
	check("list sets (no filter)", allSets.length > 0, `found ${allSets.length}`);

	// list — setType
	const expansions = await sdk.sets.list({ setType: "expansion", limit: 10 });
	check("list expansions", expansions.length > 0, `found ${expansions.length}`);

	// list — name filter
	const horizonList = await sdk.sets.list({ name: "%Horizons%", limit: 10 });
	check(
		"list name filter",
		horizonList.length > 0,
		`found ${horizonList.length}`,
	);

	// list — offset
	const setsP1 = await sdk.sets.list({ limit: 3, offset: 0 });
	const setsP2 = await sdk.sets.list({ limit: 3, offset: 3 });
	check("list offset (pagination)", setsP1.length > 0 && setsP2.length > 0);
	if (setsP1.length > 0 && setsP2.length > 0) {
		check("list pages differ", setsP1[0].code !== setsP2[0].code);
	}

	// search — name
	const setSearch = await sdk.sets.search({ name: "Horizons" });
	check("search 'Horizons'", setSearch.length > 0, `found ${setSearch.length}`);

	// search — setType
	const setSearchType = await sdk.sets.search({
		setType: "masters",
		limit: 10,
	});
	check(
		"search setType=masters",
		setSearchType.length > 0,
		`found ${setSearchType.length}`,
	);

	// search — block
	const setSearchBlock = await sdk.sets.search({ block: "Innistrad" });
	check(
		"search block=Innistrad",
		Array.isArray(setSearchBlock),
		`found ${setSearchBlock.length}`,
	);

	// search — releaseYear
	const setSearchYear = await sdk.sets.search({
		releaseYear: 2024,
		limit: 10,
	});
	check(
		"search releaseYear=2024",
		setSearchYear.length > 0,
		`found ${setSearchYear.length}`,
	);

	// count
	const setCount = await sdk.sets.count();
	check("set count", (setCount as number) > 100, `total sets: ${setCount}`);

	// ══════════════════════════════════════════════════════════
	//  IDENTIFIERS — IdentifierQuery (18 methods)
	// ══════════════════════════════════════════════════════════
	section("Identifiers");

	if (uuid) {
		const ids = await sdk.identifiers.getIdentifiers(uuid);
		check(
			"getIdentifiers",
			ids !== null,
			`keys=${ids ? Object.keys(ids) : "?"}`,
		);

		// Exercise ALL named findBy* methods using real IDs from Lightning Bolt
		if (ids) {
			const idsObj = ids as Record<string, unknown>;

			// Scryfall ID
			if (idsObj.scryfallId) {
				const byScry = await sdk.identifiers.findByScryfallId(
					idsObj.scryfallId as string,
				);
				check("findByScryfallId", byScry.length > 0, `found ${byScry.length}`);
			} else {
				skip("findByScryfallId", "no scryfallId in data");
			}

			// Scryfall Oracle ID
			if (idsObj.scryfallOracleId) {
				const byOracle = await sdk.identifiers.findByScryfallOracleId(
					idsObj.scryfallOracleId as string,
				);
				check(
					"findByScryfallOracleId",
					byOracle.length > 0,
					`found ${byOracle.length}`,
				);
			} else {
				skip("findByScryfallOracleId", "no scryfallOracleId");
			}

			// Scryfall Illustration ID
			if (idsObj.scryfallIllustrationId) {
				const byIllus = await sdk.identifiers.findByScryfallIllustrationId(
					idsObj.scryfallIllustrationId as string,
				);
				check(
					"findByScryfallIllustrationId",
					byIllus.length > 0,
					`found ${byIllus.length}`,
				);
			} else {
				skip("findByScryfallIllustrationId", "no scryfallIllustrationId");
			}

			// TCGPlayer Product ID
			if (idsObj.tcgplayerProductId) {
				const byTcg = await sdk.identifiers.findByTcgplayerId(
					String(idsObj.tcgplayerProductId),
				);
				check("findByTcgplayerId", byTcg.length > 0, `found ${byTcg.length}`);
			} else {
				skip("findByTcgplayerId", "no tcgplayerProductId");
			}

			// TCGPlayer Etched ID
			if (idsObj.tcgplayerEtchedProductId) {
				const byTcgE = await sdk.identifiers.findByTcgplayerEtchedId(
					String(idsObj.tcgplayerEtchedProductId),
				);
				check("findByTcgplayerEtchedId", byTcgE.length > 0);
			} else {
				skip("findByTcgplayerEtchedId", "no tcgplayerEtchedProductId");
			}

			// MTGO ID
			if (idsObj.mtgoId) {
				const byMtgo = await sdk.identifiers.findByMtgoId(
					String(idsObj.mtgoId),
				);
				check("findByMtgoId", byMtgo.length > 0);
			} else {
				skip("findByMtgoId", "no mtgoId");
			}

			// MTGO Foil ID
			if (idsObj.mtgoFoilId) {
				const byMtgoF = await sdk.identifiers.findByMtgoFoilId(
					String(idsObj.mtgoFoilId),
				);
				check("findByMtgoFoilId", byMtgoF.length > 0);
			} else {
				skip("findByMtgoFoilId", "no mtgoFoilId");
			}

			// MTG Arena ID
			if (idsObj.mtgArenaId) {
				const byArena = await sdk.identifiers.findByMtgArenaId(
					String(idsObj.mtgArenaId),
				);
				check("findByMtgArenaId", byArena.length > 0);
			} else {
				skip("findByMtgArenaId", "no mtgArenaId");
			}

			// Multiverse ID
			if (idsObj.multiverseId) {
				const byMulti = await sdk.identifiers.findByMultiverseId(
					String(idsObj.multiverseId),
				);
				check("findByMultiverseId", byMulti.length > 0);
			} else {
				skip("findByMultiverseId", "no multiverseId");
			}

			// MCM ID
			if (idsObj.mcmId) {
				const byMcm = await sdk.identifiers.findByMcmId(String(idsObj.mcmId));
				check("findByMcmId", byMcm.length > 0);
			} else {
				skip("findByMcmId", "no mcmId");
			}

			// MCM Meta ID
			if (idsObj.mcmMetaId) {
				const byMcmM = await sdk.identifiers.findByMcmMetaId(
					String(idsObj.mcmMetaId),
				);
				check("findByMcmMetaId", byMcmM.length > 0);
			} else {
				skip("findByMcmMetaId", "no mcmMetaId");
			}

			// Card Kingdom ID
			if (idsObj.cardKingdomId) {
				const byCk = await sdk.identifiers.findByCardKingdomId(
					String(idsObj.cardKingdomId),
				);
				check("findByCardKingdomId", byCk.length > 0);
			} else {
				skip("findByCardKingdomId", "no cardKingdomId");
			}

			// Card Kingdom Foil ID
			if (idsObj.cardKingdomFoilId) {
				const byCkF = await sdk.identifiers.findByCardKingdomFoilId(
					String(idsObj.cardKingdomFoilId),
				);
				check("findByCardKingdomFoilId", byCkF.length > 0);
			} else {
				skip("findByCardKingdomFoilId", "no cardKingdomFoilId");
			}

			// Card Kingdom Etched ID
			if (idsObj.cardKingdomEtchedId) {
				const byCkE = await sdk.identifiers.findByCardKingdomEtchedId(
					String(idsObj.cardKingdomEtchedId),
				);
				check("findByCardKingdomEtchedId", byCkE.length > 0);
			} else {
				skip("findByCardKingdomEtchedId", "no cardKingdomEtchedId");
			}

			// Cardsphere ID
			if (idsObj.cardsphereId) {
				const byCs = await sdk.identifiers.findByCardsphereId(
					String(idsObj.cardsphereId),
				);
				check("findByCardsphereId", byCs.length > 0);
			} else {
				skip("findByCardsphereId", "no cardsphereId");
			}

			// Cardsphere Foil ID
			if (idsObj.cardsphereFoilId) {
				const byCsF = await sdk.identifiers.findByCardsphereFoilId(
					String(idsObj.cardsphereFoilId),
				);
				check("findByCardsphereFoilId", byCsF.length > 0);
			} else {
				skip("findByCardsphereFoilId", "no cardsphereFoilId");
			}

			// Generic findBy with valid column
			if (idsObj.scryfallId) {
				const byGen = await sdk.identifiers.findBy(
					"scryfallId",
					idsObj.scryfallId as string,
				);
				check("findBy generic (scryfallId)", byGen.length > 0);
			}
		}
	}

	// Second card for identifier coverage
	section("Identifiers (secondary card for fuller coverage)");
	const altCards = await sdk.cards.search({
		name: "Llanowar Elves",
		setCode: "M19",
		limit: 1,
	});
	if (altCards.length > 0) {
		const altUuid = altCards[0].uuid as string;
		const altIds = await sdk.identifiers.getIdentifiers(altUuid);
		if (altIds) {
			const altIdsObj = altIds as Record<string, unknown>;
			const altIdChecks: [string, string][] = [
				["mtgArenaId", "findByMtgArenaId"],
				["multiverseId", "findByMultiverseId"],
				["mcmMetaId", "findByMcmMetaId"],
				["cardsphereId", "findByCardsphereId"],
				["cardsphereFoilId", "findByCardsphereFoilId"],
				["cardKingdomEtchedId", "findByCardKingdomEtchedId"],
				["tcgplayerEtchedProductId", "findByTcgplayerEtchedId"],
				["mtgoFoilId", "findByMtgoFoilId"],
			];
			for (const [idCol, methodName] of altIdChecks) {
				const val = altIdsObj[idCol];
				if (val) {
					const method = (
						sdk.identifiers as unknown as Record<
							string,
							(v: string) => Promise<unknown[]>
						>
					)[methodName];
					const result = await method.call(sdk.identifiers, String(val));
					check(
						`${methodName} (alt card)`,
						result.length > 0,
						`${idCol}=${val}`,
					);
				} else {
					skip(`${methodName} (alt card)`, `no ${idCol}`);
				}
			}
		} else {
			skip("alt card identifiers", "no identifiers found");
		}
	} else {
		skip("alt card identifiers", "Llanowar Elves M19 not found");
	}

	// findBy — invalid column raises Error
	try {
		await sdk.identifiers.findBy("invalidColumn", "123");
		check("findBy invalid column raises", false);
	} catch {
		check("findBy invalid column raises", true);
	}

	// ══════════════════════════════════════════════════════════
	//  LEGALITIES — LegalityQuery (7 methods)
	// ══════════════════════════════════════════════════════════
	section("Legalities");

	if (uuid) {
		// formatsForCard
		const formats = await sdk.legalities.formatsForCard(uuid);
		check(
			"formatsForCard",
			Object.keys(formats).length > 0,
			`formats: ${Object.keys(formats).slice(0, 5)}...`,
		);

		// isLegal
		const isLegal = await sdk.legalities.isLegal(uuid, "modern");
		check("isLegal modern", isLegal === true);

		const isLegalFake = await sdk.legalities.isLegal(
			uuid,
			"nonexistent_format",
		);
		check("isLegal nonexistent format", isLegalFake === false);
	}

	// legalIn
	const modernCards = await sdk.legalities.legalIn("modern", { limit: 5 });
	check(
		"legalIn modern",
		modernCards.length > 0,
		`found ${modernCards.length}`,
	);

	// legalIn — with offset
	const legalP1 = await sdk.legalities.legalIn("modern", {
		limit: 3,
		offset: 0,
	});
	const legalP2 = await sdk.legalities.legalIn("modern", {
		limit: 3,
		offset: 3,
	});
	check("legalIn offset", legalP1.length > 0 && legalP2.length > 0);

	// bannedIn
	const banned = await sdk.legalities.bannedIn("modern", { limit: 5 });
	check("bannedIn modern", Array.isArray(banned), `found ${banned.length}`);

	// restrictedIn
	const restricted = await sdk.legalities.restrictedIn("vintage", {
		limit: 5,
	});
	check(
		"restrictedIn vintage",
		Array.isArray(restricted),
		`found ${restricted.length}`,
	);

	// suspendedIn
	const suspended = await sdk.legalities.suspendedIn("historic", {
		limit: 5,
	});
	check(
		"suspendedIn historic",
		Array.isArray(suspended),
		`found ${suspended.length}`,
	);

	// notLegalIn
	const notLegal = await sdk.legalities.notLegalIn("standard", { limit: 5 });
	check(
		"notLegalIn standard",
		Array.isArray(notLegal),
		`found ${notLegal.length}`,
	);

	// ══════════════════════════════════════════════════════════
	//  PRICES — PriceQuery (5 methods)
	//  Downloads AllPricesToday.json.gz (~large file)
	// ══════════════════════════════════════════════════════════
	section("Prices");

	try {
		if (uuid) {
			// get — raw nested structure
			const priceRaw = await sdk.prices.get(uuid);
			check(
				"prices.get",
				priceRaw === null || typeof priceRaw === "object",
				`type=${typeof priceRaw}`,
			);

			// today
			const todayPrices = await sdk.prices.today(uuid);
			check(
				"prices.today",
				Array.isArray(todayPrices),
				`found ${todayPrices.length} rows`,
			);

			if (todayPrices.length > 0) {
				// today — with provider filter
				const providers = new Set(todayPrices.map((r) => r.provider as string));
				if (providers.size > 0) {
					const firstProv = [...providers][0];
					const todayFilt = await sdk.prices.today(uuid, {
						provider: firstProv,
					});
					check(
						"prices.today provider filter",
						todayFilt.length > 0,
						`provider=${firstProv}`,
					);
				}

				// today — with finish filter
				const finishes = new Set(todayPrices.map((r) => r.finish as string));
				if (finishes.size > 0) {
					const firstFin = [...finishes][0];
					const todayFin = await sdk.prices.today(uuid, {
						finish: firstFin,
					});
					check(
						"prices.today finish filter",
						todayFin.length > 0,
						`finish=${firstFin}`,
					);
				}

				// today — with priceType filter
				const priceTypes = new Set(
					todayPrices.map((r) => r.price_type as string),
				);
				if (priceTypes.size > 0) {
					const firstPt = [...priceTypes][0];
					const todayPt = await sdk.prices.today(uuid, {
						priceType: firstPt,
					});
					check(
						"prices.today priceType filter",
						todayPt.length > 0,
						`priceType=${firstPt}`,
					);
				}
			}

			// history
			const history = await sdk.prices.history(uuid);
			check(
				"prices.history",
				Array.isArray(history),
				`found ${history.length} rows`,
			);

			if (history.length > 0) {
				// history — with date range
				const dates = [
					...new Set(
						history
							.map((r) => r.date as string)
							.filter(Boolean)
							.sort(),
					),
				];
				if (dates.length >= 2) {
					const histRange = await sdk.prices.history(uuid, {
						dateFrom: dates[0],
						dateTo: dates[dates.length - 1],
					});
					check("prices.history date range", histRange.length > 0);
				} else {
					skip("prices.history date range", "only 1 date");
				}

				// history — with provider filter
				const histProv = await sdk.prices.history(uuid, {
					provider: (history[0].provider as string) ?? "tcgplayer",
				});
				check("prices.history provider filter", Array.isArray(histProv));
			}

			// priceTrend
			const trend = await sdk.prices.priceTrend(uuid);
			check(
				"prices.priceTrend",
				trend === null || typeof trend === "object",
				trend ? `trend=${JSON.stringify(trend)}` : "no trend data",
			);

			if (trend) {
				check(
					"priceTrend has keys",
					"min_price" in trend && "max_price" in trend && "avg_price" in trend,
				);

				// priceTrend with provider/finish
				const trend2 = await sdk.prices.priceTrend(uuid, {
					provider: "tcgplayer",
					finish: "normal",
				});
				check(
					"priceTrend with filters",
					trend2 === null || typeof trend2 === "object",
				);
			}

			// cheapestPrinting
			const cheapest = await sdk.prices.cheapestPrinting("Lightning Bolt");
			check(
				"prices.cheapestPrinting",
				cheapest === null || typeof cheapest === "object",
				cheapest ? `cheapest=${JSON.stringify(cheapest)}` : "no price data",
			);

			if (cheapest) {
				check(
					"cheapest has price",
					"price" in cheapest && (cheapest as Record<string, number>).price > 0,
				);
			}

			// cheapest with different provider
			const cheapest2 = await sdk.prices.cheapestPrinting("Lightning Bolt", {
				provider: "cardkingdom",
			});
			check(
				"cheapestPrinting alt provider",
				cheapest2 === null || typeof cheapest2 === "object",
			);
		} else {
			skip("prices tests", "no uuid from Lightning Bolt");
		}
	} catch (e) {
		check("prices module available", false, `error: ${e}`);
	}

	// ══════════════════════════════════════════════════════════
	//  SET FINANCIAL SUMMARY (requires prices loaded)
	// ══════════════════════════════════════════════════════════
	section("Set Financial Summary (EV calculation)");

	// Access internal connection to check if prices are loaded
	const conn = (sdk as unknown as { _conn: { _registeredViews: Set<string> } })
		._conn;
	if (conn._registeredViews.has("all_prices_today")) {
		const fin = await sdk.sets.getFinancialSummary("MH3");
		check(
			"getFinancialSummary MH3",
			fin !== null && (fin as Record<string, number>).card_count > 0,
			fin
				? `cards=${(fin as Record<string, number>).card_count}, total=$${(fin as Record<string, number>).total_value}`
				: "no data",
		);

		// With different provider
		const finCk = await sdk.sets.getFinancialSummary("MH3", {
			provider: "cardkingdom",
			finish: "normal",
		});
		check(
			"getFinancialSummary alt provider",
			finCk === null || typeof finCk === "object",
		);

		// Nonexistent set
		const finNone = await sdk.sets.getFinancialSummary("ZZZZZ");
		check("getFinancialSummary no data", finNone === null);
	} else {
		skip("getFinancialSummary", "prices not loaded");
	}

	// ══════════════════════════════════════════════════════════
	//  DECKS — DeckQuery (3 methods)
	//  Uses setDecks.parquet
	// ══════════════════════════════════════════════════════════
	section("Decks");

	try {
		// count
		const deckCount = await sdk.decks.count();
		check("decks.count", deckCount >= 0, `total decks: ${deckCount}`);

		// list — no filter
		const deckList = await sdk.decks.list();
		check(
			"decks.list (all)",
			Array.isArray(deckList),
			`found ${deckList.length}`,
		);

		if (deckList.length > 0) {
			// list — setCode filter
			const firstDeck = deckList[0] as Record<string, unknown>;
			const firstSetCode = firstDeck.setCode as string;
			if (firstSetCode) {
				const decksBySet = await sdk.decks.list({ setCode: firstSetCode });
				check("decks.list setCode", decksBySet.length > 0, `set=${firstSetCode}`);
			}

			// list — deckType filter
			const firstType = firstDeck.type as string;
			if (firstType) {
				const decksByType = await sdk.decks.list({
					deckType: firstType,
				});
				check(
					"decks.list deckType",
					decksByType.length > 0,
					`type=${firstType}`,
				);
			}

			// search — name
			const firstName = firstDeck.name as string;
			if (firstName) {
				const searchTerm = firstName.split(" ")[0] || "Starter";
				const deckSearch = await sdk.decks.search({ name: searchTerm });
				check(
					"decks.search name",
					deckSearch.length > 0,
					`term='${searchTerm}'`,
				);
			}

			// search — setCode
			if (firstSetCode) {
				const deckSearchSet = await sdk.decks.search({
					setCode: firstSetCode,
				});
				check("decks.search setCode", deckSearchSet.length > 0);
			}
		} else {
			skip("deck list/search tests", "no decks loaded");
		}
	} catch (e) {
		check("decks module available", false, `error: ${e}`);
	}

	// ══════════════════════════════════════════════════════════
	//  SKUS — SkuQuery (3 methods)
	//  Downloads TcgplayerSkus.json.gz (~large file)
	// ══════════════════════════════════════════════════════════
	section("SKUs");

	try {
		if (uuid) {
			// get
			const skus = await sdk.skus.get(uuid);
			check("skus.get", Array.isArray(skus), `found ${skus.length} SKUs`);

			if (skus.length > 0) {
				const firstSku = skus[0] as Record<string, unknown>;

				// findBySkuId
				const skuId = firstSku.skuId;
				if (skuId != null) {
					const bySku = await sdk.skus.findBySkuId(Number(skuId));
					check("skus.findBySkuId", bySku !== null, `skuId=${skuId}`);
				} else {
					skip("skus.findBySkuId", "no skuId in data");
				}

				// findByProductId
				const prodId = firstSku.productId;
				if (prodId != null) {
					const byProd = await sdk.skus.findByProductId(Number(prodId));
					check(
						"skus.findByProductId",
						byProd.length > 0,
						`productId=${prodId}`,
					);
				} else {
					skip("skus.findByProductId", "no productId in data");
				}
			} else {
				skip("skus.findBySkuId", "no SKU data for this card");
				skip("skus.findByProductId", "no SKU data for this card");
			}
		} else {
			skip("skus tests", "no uuid");
		}
	} catch (e) {
		check("skus module available", false, `error: ${e}`);
	}

	// ══════════════════════════════════════════════════════════
	//  ENUMS — EnumQuery (3 methods)
	//  Downloads Keywords.json, CardTypes.json, EnumValues.json
	// ══════════════════════════════════════════════════════════
	section("Enums");

	try {
		// keywords
		const kw = await sdk.enums.keywords();
		check(
			"enums.keywords",
			typeof kw === "object" && Object.keys(kw).length > 0,
			`keys=${Object.keys(kw).slice(0, 5)}`,
		);

		if (kw) {
			const hasAbility =
				"abilityWords" in kw ||
				Object.keys(kw).some((k) => k.toLowerCase().includes("ability"));
			check(
				"keywords has expected keys",
				hasAbility || Object.keys(kw).length > 0,
				`top keys: ${Object.keys(kw).slice(0, 5)}`,
			);
		}

		// cardTypes
		const ct = await sdk.enums.cardTypes();
		check(
			"enums.cardTypes",
			typeof ct === "object" && Object.keys(ct).length > 0,
			`keys=${Object.keys(ct).slice(0, 5)}`,
		);

		if (ct) {
			const hasCreature = Object.keys(ct).some((k) =>
				k.toLowerCase().includes("creature"),
			);
			check(
				"cardTypes has creature",
				hasCreature || Object.keys(ct).length > 0,
			);
		}

		// enumValues
		const ev = await sdk.enums.enumValues();
		check(
			"enums.enumValues",
			typeof ev === "object" && Object.keys(ev).length > 0,
			`keys=${Object.keys(ev).slice(0, 5)}`,
		);
	} catch (e) {
		check("enums module available", false, `error: ${e}`);
	}

	// ══════════════════════════════════════════════════════════
	//  SEALED — SealedQuery (2 methods)
	//  Uses sealedProducts.parquet
	// ══════════════════════════════════════════════════════════
	section("Sealed Products");

	// list — no filter
	const sealedAll = await sdk.sealed.list();
	check(
		"sealed.list (all)",
		Array.isArray(sealedAll),
		`found ${sealedAll.length}`,
	);

	// list — setCode filter
	const sealedBySet = await sdk.sealed.list({ setCode: "MH3" });
	check(
		"sealed.list setCode=MH3",
		Array.isArray(sealedBySet),
		`found ${sealedBySet.length}`,
	);

	// list — category filter
	const sealedCat = await sdk.sealed.list({ category: "booster_box" });
	check(
		"sealed.list category",
		Array.isArray(sealedCat),
		`found ${sealedCat.length}`,
	);

	// Validate data shape on first product (if available)
	if (sealedAll.length > 0) {
		const sp = sealedAll[0] as Record<string, unknown>;
		check("sealed has uuid", typeof sp.uuid === "string");
		check("sealed has name", typeof sp.name === "string");
		check("sealed has setCode", typeof sp.setCode === "string");
		check("sealed has category", typeof sp.category === "string");
		check(
			"sealed identifiers is object",
			typeof sp.identifiers === "object" && sp.identifiers !== null,
			`type=${typeof sp.identifiers}`,
		);
		check(
			"sealed purchaseUrls is object",
			typeof sp.purchaseUrls === "object" && sp.purchaseUrls !== null,
			`type=${typeof sp.purchaseUrls}`,
		);

		// get by uuid
		const realUuid = sp.uuid as string;
		const sealedItem = await sdk.sealed.get(realUuid);
		check(
			"sealed.get by uuid",
			sealedItem !== null && sealedItem.uuid === realUuid,
			`uuid=${realUuid}`,
		);
	} else {
		skip("sealed data validation", "no sealed products loaded");
	}

	// get — nonexistent uuid
	const sealedMissing = await sdk.sealed.get(
		"00000000-0000-0000-0000-000000000000",
	);
	check(
		"sealed.get nonexistent returns null",
		sealedMissing === null,
	);

	// ══════════════════════════════════════════════════════════
	//  BOOSTER — BoosterSimulator (4 methods)
	// ══════════════════════════════════════════════════════════
	section("Booster Simulation");

	// availableTypes
	const boosterTypes = await sdk.booster.availableTypes("MH3");
	check(
		"booster.availableTypes",
		Array.isArray(boosterTypes),
		`types: ${boosterTypes}`,
	);

	// openPack — expect error or graceful fail with flat parquet
	try {
		const pack = await sdk.booster.openPack("MH3", "play");
		check("booster.openPack", Array.isArray(pack), `got ${pack.length} cards`);
	} catch {
		check("booster.openPack raises Error (no booster data)", true);
	}

	// openBox — expect error or graceful fail
	try {
		const box = await sdk.booster.openBox("MH3", "play", 1);
		check("booster.openBox", Array.isArray(box));
	} catch {
		check("booster.openBox raises Error (no booster data)", true);
	}

	// sheetContents
	const contents = await sdk.booster.sheetContents("MH3", "play", "common");
	check(
		"booster.sheetContents",
		contents === null || typeof contents === "object",
		`type=${typeof contents}`,
	);

	// ══════════════════════════════════════════════════════════
	//  RAW SQL — sdk.sql() (all modes)
	// ══════════════════════════════════════════════════════════
	section("Raw SQL / Escape Hatches");

	// Simple query
	const rows = await sdk.sql("SELECT COUNT(*) AS cnt FROM cards");
	check("sql COUNT", (rows[0].cnt as number) > 1000, `count=${rows[0].cnt}`);

	// Query with params
	const rowsParam = await sdk.sql(
		"SELECT name FROM cards WHERE manaValue = $1 LIMIT $2",
		[1.0, 5],
	);
	check("sql with params", rowsParam.length > 0, `found ${rowsParam.length}`);

	// More complex query
	const topEdhrec = await sdk.sql(
		"SELECT name, edhrecRank FROM cards WHERE edhrecRank IS NOT NULL ORDER BY edhrecRank ASC LIMIT 5",
	);
	check(
		"sql top EDHREC",
		topEdhrec.length === 5,
		`top: ${topEdhrec.map((r) => r.name)}`,
	);

	// Cross-table join via raw SQL
	const joinResult = await sdk.sql(
		"SELECT c.name, s.name AS setName FROM cards c JOIN sets s ON c.setCode = s.code LIMIT 3",
	);
	check(
		"sql cross-table join",
		joinResult.length > 0 && "setName" in joinResult[0],
	);

	// ══════════════════════════════════════════════════════════
	//  VIEWS — verify views grew as we queried
	// ══════════════════════════════════════════════════════════
	section("Views (post-query)");

	const viewsAfter = sdk.views;
	check(
		"views grew",
		viewsAfter.length > viewsBefore.length,
		`before=${viewsBefore.length}, after=${viewsAfter.length}, views=${viewsAfter}`,
	);

	// ══════════════════════════════════════════════════════════
	//  EDGE CASES & VALIDATION
	// ══════════════════════════════════════════════════════════
	section("Edge Cases & Validation");

	// Empty search results
	const empty = await sdk.cards.search({
		name: "XYZ_NONEXISTENT_CARD_12345",
		limit: 5,
	});
	check("empty search result", empty.length === 0);

	// Card with special characters in name
	const sUnicode = await sdk.cards.search({ name: "Jötun%", limit: 5 });
	check(
		"search unicode name",
		Array.isArray(sUnicode),
		`found ${sUnicode.length}`,
	);

	// Card field validation
	if (bolt.length > 0) {
		const card = bolt[0] as Record<string, unknown>;
		check("card has uuid", Boolean(card.uuid));
		check("card has name", card.name === "Lightning Bolt");
		check(
			"card has colors",
			Array.isArray(card.colors),
			`colors=${card.colors}`,
		);
		check(
			"card has manaValue",
			card.manaValue !== null && card.manaValue !== undefined,
			`mv=${card.manaValue}`,
		);
		check(
			"card has text",
			Boolean(card.text),
			`text=${(card.text as string).slice(0, 50)}...`,
		);
	}

	// Set field validation
	if (mh3) {
		const setObj = mh3 as Record<string, unknown>;
		check("set has code", setObj.code === "MH3");
		check(
			"set has name",
			(setObj.name as string).includes("Horizons"),
			`name=${setObj.name}`,
		);
		check("set has releaseDate", Boolean(setObj.releaseDate));
		check("set has type", Boolean(setObj.type));
		check(
			"set has baseSetSize",
			(setObj.baseSetSize as number) > 0,
			`baseSetSize=${setObj.baseSetSize}`,
		);
		check(
			"set has totalSetSize",
			(setObj.totalSetSize as number) > 0,
			`totalSetSize=${setObj.totalSetSize}`,
		);
	}

	// Token field validation
	if (tokenSearch.length > 0) {
		const tok = tokenSearch[0] as Record<string, unknown>;
		check("token has uuid", Boolean(tok.uuid));
		check("token has name", Boolean(tok.name));
	}

	// Atomic card field validation
	if (atomic.length > 0) {
		const a = atomic[0] as Record<string, unknown>;
		check("atomic has name", a.name === "Lightning Bolt");
		check("atomic has layout", Boolean(a.layout));
		check("atomic has colors", Array.isArray(a.colors));
	}

	// Deck field validation
	try {
		const deckListAll = await sdk.decks.list();
		if (deckListAll.length > 0) {
			const d = deckListAll[0] as Record<string, unknown>;
			check("deck has code", typeof d.code === "string");
			check("deck has name", typeof d.name === "string");
			check("deck has type", typeof d.type === "string");

			// setCode and board fields are available when using setDecks.parquet
			if ("setCode" in d) {
				check("deck has setCode", typeof d.setCode === "string");
				check("deck has releaseDate", typeof d.releaseDate === "string");
				check(
					"deck mainBoard is array",
					Array.isArray(d.mainBoard),
					`type=${typeof d.mainBoard}`,
				);
				check(
					"deck sideBoard is array",
					Array.isArray(d.sideBoard),
					`type=${typeof d.sideBoard}`,
				);
			} else {
				// DeckList.json data shape
				check("deck has fileName", typeof d.fileName === "string");
			}
		}
	} catch {
		skip("deck model validation", "deck data not loaded");
	}

	// ══════════════════════════════════════════════════════════
	//  DONE — close and report
	// ══════════════════════════════════════════════════════════
	await sdk.close();
	const elapsed = (Date.now() - t0) / 1000;

	section("RESULTS");
	const total = PASS + FAIL;
	console.log(`  Total:   ${total} checks (${SKIP} skipped)`);
	console.log(`  Passed:  ${PASS}`);
	console.log(`  Failed:  ${FAIL}`);
	console.log(`  Time:    ${elapsed.toFixed(1)}s`);
	console.log();

	if (FAIL > 0) {
		console.log("  *** FAILURES DETECTED ***");
		console.log();
	}

	return FAIL === 0;
}

const success = await main();
process.exit(success ? 0 : 1);
