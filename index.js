import { PumpChatClient } from "pump-chat-client";
import { promises as fs } from "node:fs";
import path from "node:path";
import "dotenv/config";

// Cache

const CACHE_FILE = path.join(".cache", "pf-cache.json");
const API_URL = process.env.API_URL;
const API_TOKEN = process.env.API_TOKEN;
let ENV = "prod";

if (!API_URL || !API_TOKEN) {
	console.error("API_URL and API_TOKEN must be set in environment variables.");
	process.exit(1);
}

async function ensureDir(filePath) {
	await fs.mkdir(path.dirname(filePath), { recursive: true });
}
async function readLastMsgId() {
	try {
		const raw = await fs.readFile(CACHE_FILE, "utf8");
		return JSON.parse(raw);
	} catch {
		return {};
	}
}
async function writeLastMsgId(lastSeen) {
	await ensureDir(CACHE_FILE);
	await fs.writeFile(CACHE_FILE, JSON.stringify(lastSeen, null, 2), "utf8");
}

// Parse messages
function parseUsername(username) {
	if (username.length >= 32) {
		return username.slice(-6);
	}
	return username;
}
async function parseTopic(msg) {
	console.info(`Parsing: ${msg.username} - ${msg.message}`);
	if (
		msg.message.toLowerCase().startsWith("/addtopic ") ||
		msg.message.toLowerCase().startsWith("!addtopic ")
	) {
		await addTopic({
			user: {
				id: msg.userAddress,
				username: parseUsername(msg.username),
			},
			topic: msg.message.substring(10).trim(),
			platform: "PF",
			platform_data: null,
		});
	}
}
async function parseMessages(messages) {
	const newMessages = [];
	const lastSeen = await readLastMsgId();
	for (const msg of messages) {
		if (lastSeen.msgId === msg.id) {
			break;
		}
		newMessages.push(msg);
		lastSeen[msg.userId] = msg.id;
	}
	for (const msg of newMessages.reverse()) {
		await parseTopic(msg);
		writeLastMsgId({ msgId: msg.id });
	}
}

// Add topic
async function addTopic(requestData) {
	console.info("Adding topic:", requestData.topic);
	const response = await fetch(API_URL, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: API_TOKEN,
			...(ENV !== "prod" ? { "x-env": ENV } : {}),
		},
		body: JSON.stringify(requestData),
	});
	if (!response.ok) {
		console.error("Failed to add topic:", await response.json());
		return;
	}
}

// Fetch messages from Pump chat
async function fetchPumpMessages() {
	const client = new PumpChatClient({
		roomId: "AK9yVoXKK1Cjww7HDyjYNyW5FujD3FJ2xbjMUStspump",
		messageHistoryLimit: 5,
	});
	client.on("message", async (message) => {
		await parseMessages([message]);
	});
	client.connect();
}

await fetchPumpMessages();
