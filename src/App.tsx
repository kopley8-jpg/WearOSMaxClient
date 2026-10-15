import { useEffect, useRef, useState } from "react";
import { MaxBridge } from "./shared/max/maxBridge";
import { createStyles } from "./shared/lib/createStyles";
import type { ChatPreview, Screen } from "./shared/types/types";
import { ChatListScreen } from "./screens/ChatListScreen";
import { ChatScreen } from "./screens/ChatScreen";

const App = () => {
  const bridgeRef = useRef<MaxBridge | null>(null);
  const styles = useStyles();
  const [connected, setConnected] = useState(false);
  const [chats, setChats] = useState<ChatPreview[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>({
    type: "chats",
  });

  useEffect(() => {
    const bridge = new MaxBridge();
    bridgeRef.current = bridge;

    bridge.addEventListener("connected", () => setConnected(true));
    bridge.addEventListener("disconnected", () => setConnected(false));
    bridge.addEventListener("push", (e) => {
      console.log("← PUSH:", (e as CustomEvent).detail);
    });

    bridge.connect().catch((err) => setError(String(err)));

    return () => {
      bridge.disconnect();
      bridgeRef.current = null;
    };
  }, []);

  const run = async (fn: () => Promise<void>) => {
    setError(null);
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleAuth = () =>
    run(async () => {
      const result = await bridgeRef.current!.auth();

      console.log("AUTH RESULT:", result);
      console.log("AUTH CHATS:", result.chats);

      setChats(result.chats ?? []);
    });

  const handleUpload = () =>
    run(async () => {
      await bridgeRef.current!.sendVoice(
        "C:\\nigga\\projects\\maxClient\\src\\test.mp3",
      );
    });

  const handleHistory = (chatId: string) =>
    run(async () => {
      const result = await bridgeRef.current!.getHistory(chatId);
      console.log("HISTORY:", result);
    });

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <button onClick={handleAuth} disabled={busy}>
          Авторизоваться
        </button>
        <button onClick={handleUpload} disabled={busy || !connected}>
          Загрузить аудио
        </button>
        <span>{connected ? "🟢 Connected" : "🔴 Disconnected"}</span>
        {busy && <span>⏳</span>}
      </div>

      {error && <div style={styles.error}>{error}</div>}
      <div style={styles.content}>
        <div style={styles.watchContainer}>
          <a>Экран часов "Типа"</a>
          <div style={styles.watchScreen}>
            {screen.type === "chats" && (
              <ChatListScreen chats={chats} onChatClick={handleHistory} />
            )}
            {screen.type === "chat" && (
              <ChatScreen
                chatId={screen.chatId}
                onGoBack={() => setScreen({ type: "chats" })}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const useStyles = () => {
  return createStyles({
    container: {
      height: "100vh",
      width: "100vw",
      backgroundColor: "white",
    },
    header: {
      width: "100%",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      gap: 20,
      borderBottom: "1px solid grey",
      padding: 20,
    },
    error: {
      color: "red",
      padding: "8px 20px",
      fontFamily: "monospace",
      fontSize: 13,
    },
    content: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      flex: 1,
    },
    watchContainer: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
    },
    watchScreen: {
      height: 450,
      width: 450,
      borderRadius: "50%",
      border: "1px solid black",
      display: "flex",
      overflow: "hidden",
    },
  });
};

export default App;
