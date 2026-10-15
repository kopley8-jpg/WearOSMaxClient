import { colors } from "../../../../shared/constants/theme";
import { createStyles } from "../../../../shared/lib/createStyles";
import type { ChatLastMessage } from "../../../../shared/types/types";

export const LastMessage = ({
  lastMessage,
}: {
  lastMessage: ChatLastMessage;
}) => {
  const styles = useStyles();

  const Text = ({ children }: { children: React.ReactNode }) => {
    return <a style={styles.text}>{children}</a>;
  };
  switch (lastMessage.type) {
    case "text":
      return <Text>{lastMessage.text}</Text>;
    case "voice":
      return (
        <Text>
          {"Голосовое" +
            ` (${Math.round(lastMessage.duration / 100)}) сек.`}{" "}
        </Text>
      );
    case "photo":
      return <Text>Фото</Text>;
    case "audio":
      return <Text>Аудио</Text>;
    case "video":
      return <Text>Видео</Text>;
    case "file":
      return <Text>Файл</Text>;
    case "call":
      return <Text>Звонок</Text>;
    case "control":
      return <Text>{lastMessage.text}</Text>;
    case "forward":
      return <Text>Ответ на сообщение</Text>;
    case "sticker":
      return <Text>Стикер</Text>;
  }
};

const useStyles = () => {
  return createStyles({
    text: {
      fontFamily: "Roboto",
      fontSize: 14,
      display: "-webkit-box",
      WebkitLineClamp: 2,
      WebkitBoxOrient: "vertical",
      overflow: "hidden",
      textOverflow: "ellipsis",
      color: colors.onSecondaryContainer,
    },
  });
};
