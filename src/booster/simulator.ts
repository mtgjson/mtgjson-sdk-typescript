import type { Connection } from "../connection.js";
import type {
	BoosterConfig,
	BoosterPack,
	BoosterSheet,
	CardSet,
} from "../types/index.js";

export class BoosterSimulator {
	private _conn: Connection;

	constructor(conn: Connection) {
		this._conn = conn;
	}

	private async _ensure(): Promise<void> {
		await this._conn.ensureViews(
			"sets",
			"cards",
			"set_booster_content_weights",
			"set_booster_contents",
			"set_booster_sheet_cards",
			"set_booster_sheets",
		);
	}

	private async _getBoosterConfig(
		setCode: string,
	): Promise<Record<string, BoosterConfig> | null> {
		await this._ensure();
		try {
			const setBoosterContentWeightsRows = await this._conn.execute(
				"SELECT * FROM set_booster_content_weights WHERE setCode = $1",
				[setCode.toUpperCase()],
			);
			if (!setBoosterContentWeightsRows.length) return null;

			const boosterWeights = new Map<string, Map<number, number>>();
			for (const row of setBoosterContentWeightsRows) {
				const name = row.boosterName as string;
				const index = Number(row.boosterIndex);
				const weight = Number(row.boosterWeight);

				if (!boosterWeights.has(name)) {
					boosterWeights.set(name, new Map());
				}
				boosterWeights.get(name)!.set(index, weight);
			}

			const setBoosterContentRows = await this._conn.execute(
				"SELECT * FROM set_booster_contents WHERE setCode = $1",
				[setCode.toUpperCase()],
			);

			if (!setBoosterContentRows.length) return null;

			const boostersByName: Record<string, Map<number, BoosterPack>> = {};

			for (const row of setBoosterContentRows) {
				const name = row.boosterName as string;
				const index = Number(row.boosterIndex);
				const sheetName = row.sheetName as string;
				const sheetPicks = Number(row.sheetPicks);

				if (!boostersByName[name]) {
					boostersByName[name] = new Map();
				}

				const boosterIndexMap = boostersByName[name];
				if (!boosterIndexMap.has(index)) {
					const weight = boosterWeights.get(name)?.get(index) ?? 0;
					boosterIndexMap.set(index, { contents: {}, weight });
				}

				const booster = boosterIndexMap.get(index)!;
				booster.contents[sheetName] = sheetPicks;
			}

			const config: Record<string, BoosterConfig> = {};
			for (const [name, boosterIndexMap] of Object.entries(boostersByName)) {
				config[name] = {
					boosters: Array.from(boosterIndexMap.values()),
					boostersTotalWeight: Array.from(boosterIndexMap.values()).reduce(
						(sum, b) => sum + b.weight,
						0,
					),
					sheets: {},
					sourceSetCodes: [],
				};
			}

			const setBoosterSheetsRows = await this._conn.execute(
				"SELECT * FROM set_booster_sheets WHERE setCode = $1",
				[setCode.toUpperCase()],
			);

			const setBoosterSheetCardsRows = await this._conn.execute(
				"SELECT * FROM set_booster_sheet_cards WHERE setCode = $1",
				[setCode.toUpperCase()],
			);

			for (const row of setBoosterSheetsRows) {
				const boosterName = row.boosterName as string;
				const sheetName = row.sheetName as string;

				if (config[boosterName]) {
					const cards: Record<string, number> = {};
					for (const cardRow of setBoosterSheetCardsRows) {
						if (
							cardRow.boosterName === boosterName &&
							cardRow.sheetName === sheetName
						) {
							cards[cardRow.cardUuid as string] = Number(cardRow.cardWeight);
						}
					}

					config[boosterName].sheets[sheetName] = {
						allowDuplicates: true, // Not in data
						balanceColors: Boolean(row.sheetHasBalanceColors),
						cards,
						foil: Boolean(row.sheetIsFoil),
						totalWeight: Number(row.sheetTotalWeight),
					};
				}
			}

			return config;
		} catch {
			return null;
		}
	}

	async getBoosterData(
        setCode: string,
    ): Promise<Record<string, BoosterConfig> | null> {
        return this._getBoosterConfig(setCode);
    }
	
	async availableTypes(setCode: string): Promise<string[]> {
		await this._ensure();
		const rows = await this._conn.execute(
			"SELECT DISTINCT boosterName FROM set_booster_contents WHERE setCode = $1",
			[setCode.toUpperCase()],
		);

		return rows.map((row) => row.boosterName as string);
	}

	async openPack(setCode: string, boosterType = "draft"): Promise<CardSet[]> {
		const configs = await this._getBoosterConfig(setCode);
		if (!configs || !(boosterType in configs)) {
			throw new Error(
				`No booster config for set '${setCode}' type '${boosterType}'. ` +
					`Available: ${configs ? Object.keys(configs) : []}`,
			);
		}

		const config = configs[boosterType];
		const packTemplate = pickPack(config.boosters);
		const sheets = config.sheets;

		const cardUuids: string[] = [];
		for (const [sheetName, count] of Object.entries(packTemplate.contents)) {
			if (!(sheetName in sheets)) continue;
			const sheet = sheets[sheetName];
			const picked = pickFromSheet(sheet, count);
			cardUuids.push(...picked);
		}

		if (cardUuids.length === 0) return [];

		await this._conn.ensureViews("cards");
		const placeholders = cardUuids.map((_, i) => `$${i + 1}`).join(", ");
		const sql = `SELECT * FROM cards WHERE uuid IN (${placeholders})`;
		const rows = await this._conn.execute(sql, cardUuids);

		// Preserve pack order
		const uuidToRow = new Map<string, Record<string, unknown>>();
		for (const r of rows) {
			uuidToRow.set(r.uuid as string, r);
		}
		const ordered: Record<string, unknown>[] = [];
		for (const u of cardUuids) {
			const row = uuidToRow.get(u);
			if (row) ordered.push(row);
		}
		return ordered as CardSet[];
	}

	async openBox(
		setCode: string,
		boosterType = "draft",
		packs = 36,
	): Promise<CardSet[][]> {
		const results: CardSet[][] = [];
		for (let i = 0; i < packs; i++) {
			results.push(await this.openPack(setCode, boosterType));
		}
		return results;
	}

	async sheetContents(
		setCode: string,
		boosterType: string,
		sheetName: string,
	): Promise<Record<string, number> | null> {
		const configs = await this._getBoosterConfig(setCode);
		if (!configs || !(boosterType in configs)) return null;
		const sheets = configs[boosterType].sheets ?? {};
		const sheet = sheets[sheetName];
		if (!sheet) return null;
		return sheet.cards;
	}
}

function pickPack(boosters: BoosterPack[]): BoosterPack {
	const weights = boosters.map((b) => b.weight);
	return weightedChoice(boosters, weights);
}

function pickFromSheet(sheet: BoosterSheet, count: number): string[] {
	const cards = sheet.cards;
	const uuids = Object.keys(cards);
	const weights = Object.values(cards);
	const allowDuplicates = sheet.allowDuplicates ?? false;

	if (allowDuplicates) {
		const picked: string[] = [];
		for (let i = 0; i < count; i++) {
			picked.push(weightedChoice(uuids, weights));
		}
		return picked;
	}

	if (count >= uuids.length) {
		const result = [...uuids];
		shuffle(result);
		return result;
	}

	// Pick without replacement
	const picked: string[] = [];
	const remainingUuids = [...uuids];
	const remainingWeights = [...weights];

	for (let i = 0; i < Math.min(count, remainingUuids.length); i++) {
		const choice = weightedChoice(remainingUuids, remainingWeights);
		picked.push(choice);
		const idx = remainingUuids.indexOf(choice);
		remainingUuids.splice(idx, 1);
		remainingWeights.splice(idx, 1);
	}
	return picked;
}

function weightedChoice<T>(items: T[], weights: number[]): T {
	const totalWeight = weights.reduce((a, b) => a + b, 0);
	let random = Math.random() * totalWeight;
	for (let i = 0; i < items.length; i++) {
		random -= weights[i];
		if (random <= 0) return items[i];
	}
	return items[items.length - 1];
}

function shuffle<T>(array: T[]): void {
	for (let i = array.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[array[i], array[j]] = [array[j], array[i]];
	}
}
