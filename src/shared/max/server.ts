import { WebSocketServer } from "ws";
import { MaxClient } from "./client";
import { secret } from "../../secret";

const LOCAL_PORT = 3001;
const DEFAULT_CHAT_ID = 195345177n; // TODO: сделать параметром запроса от браузера

const client = new MaxClient({
  token: secret.token,
  deviceId: secret.deviceId,
});

client.on("error", (err) => console.error("MAX ERROR:", err));
client.on("close", (info) => console.log("MAX WebSocket closed:", info));
client.on("push", (frame) =>
  console.log("← MAX PUSH:", { opcode: frame.opcode, cmd: frame.cmd }),
);

const server = new WebSocketServer({ port: LOCAL_PORT });
console.log(`Local WebSocket: ws://localhost:${LOCAL_PORT}`);

server.on("connection", (browserWs) => {
  console.log("Browser connected");

  browserWs.on("message", async (raw) => {
    const message = JSON.parse(raw.toString());

    const reply = (type: string, payload?: unknown) =>
      browserWs.send(toBrowserSafeJSON({ type, payload }));

    const replyError = (type: string, error: unknown) => {
      console.error("SERVER ERROR:", error);

      browserWs.send(
        toBrowserSafeJSON({
          type,
          error: String(error),
        }),
      );
    };

    try {
      switch (message.type) {
        case "AUTH": {
          const result = await client.connect();

          reply("AUTH_SUCCESS", result);
          break;
        }

        case "GET_HISTORY": {
          if (!client.isConnected) await client.connect();
          const result = await client.getHistory(message.path);
          reply("HISTORY_SUCCESS", result);
          break;
        }

        case "SEND_VOICE": {
          if (!client.isConnected) await client.connect();
          const result = await client.sendVoice(DEFAULT_CHAT_ID, message.path);
          reply("VOICE_SUCCESS", result);
          break;
        }

        case "UPLOAD_AUDIO": {
          if (!client.isConnected) await client.connect();
          const result = await client.sendFile(DEFAULT_CHAT_ID, message.path);
          reply("UPLOAD_SUCCESS", result);
          break;
        }

        default:
          console.log("Unknown message type:", message.type);
      }
    } catch (error) {
      replyError(`${message.type}_ERROR`, error);
    }
  });

  browserWs.on("close", (code, reason) => {
    console.log("BROWSER WS CLOSE:", code, reason.toString());
  });

  browserWs.on("error", (error) => {
    console.error("BROWSER WS ERROR:", error);
  });
});

function toBrowserSafeJSON(obj: unknown): string {
  return JSON.stringify(obj, (_, v) =>
    typeof v === "bigint" ? v.toString() : v,
  );
}
