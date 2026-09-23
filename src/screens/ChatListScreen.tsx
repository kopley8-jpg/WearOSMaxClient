import type { ChatPreview } from "../shared/types/types";
import { ChatsList } from "../ui/ChatList/ChatsList";

export const ChatListScreen = ({
  chats,
}: {
  chats: ChatPreview[];
  onChatClick: (chatId: number) => void;
}) => {
  return <ChatsList chats={chats} />;
};
