import { createStyles } from "../../shared/lib/createStyles";
import type { ChatPreview } from "../../shared/types/types";
import { ChatCard } from "./ChatCard/ChatCard";

export const ChatsList = ({ chats }: { chats: ChatPreview[] }) => {
  const styles = useStyles();
  return (
    <div style={styles.container}>
      {chats.map((chat) => (
        <ChatCard {...chat} onClick={() => {}} />
      ))}
    </div>
  );
};

const useStyles = () => {
  return createStyles({
    container: {
      display: "flex",
      flexDirection: "column",
      alignItems: "stretch",
    },
  });
};
