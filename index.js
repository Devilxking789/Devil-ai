const { default: makeWASocket, useSingleFileAuthState, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, getContentType, downloadContentFromMessage, jidNormalizedUser } = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");
const P = require("pino");
const fs = require("fs");
const { Configuration, OpenAIApi } = require("openai");
const config = require("./config.json");

const { state, saveState } = useSingleFileAuthState("./session.json");

const openai = new OpenAIApi(new Configuration({ apiKey: config.OPENAI_KEY }));

async function startSock() {
    const { version } = await fetchLatestBaileysVersion();
    const sock = makeWASocket({
        version,
        logger: P({ level: "silent" }),
        printQRInTerminal: true,
        auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, P({ level: "silent" })) }
    });

    sock.ev.on("creds.update", saveState);

    sock.ev.on("messages.upsert", async ({ messages }) => {
        const m = messages[0];
        if (!m.message || m.key.fromMe) return;

        const type = getContentType(m.message);
        const text = m.message[type]?.text || m.message?.conversation;
        if (!text) return;

        const reply = async (txt) => {
            await sock.sendMessage(m.key.remoteJid, { text: txt }, { quoted: m });
        };

        try {
            const response = await openai.createChatCompletion({
                model: "gpt-3.5-turbo",
                messages: [{ role: "user", content: text }]
            });
            const gptReply = response.data.choices[0].message.content;
            await reply(gptReply);
        } catch (e) {
            await reply("Error: " + e.message);
        }
    });
}

startSock();