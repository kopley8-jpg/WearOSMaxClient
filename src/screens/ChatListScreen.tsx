import { colors } from "../shared/constants/theme";
import { createStyles } from "../shared/lib/createStyles";
import type { ChatPreview } from "../shared/types/types";
import { ChatsList } from "../ui/ChatList/ChatsList";

export const ChatListScreen = ({
  chats,
}: {
  chats: ChatPreview[];
  onChatClick: (chatId: number) => void;
}) => {
  const styles = useStyles();
  return (
    <div style={styles.container}>
      <ChatsList chats={chats} />
    </div>
  );
};

const useStyles = () => {
  return createStyles({
    container: {
      display: "flex",
      flexDirection: "column",
      flex: 1,
      alignItems: "center",
      overflow: "scroll",
      backgroundColor: colors.background,
    },
  });
};
