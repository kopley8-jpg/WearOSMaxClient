import { colors } from "../../../shared/constants/colors";
import { createStyles } from "../../../shared/lib/createStyles";
import type { ChatPreview } from "../../../shared/types/types";
import { LastMessage } from "./ui/LastMessage";

type ChatCardProps = Omit<ChatPreview, "type"> & { onClick: () => void };

export const ChatCard = (props: ChatCardProps) => {
  const { id, title, avatarUrl, lastMessage, onClick } = props;
  const styles = useStyles();
  return (
    <div style={styles.container} onClick={onClick}>
      {avatarUrl ? (
        <img src={avatarUrl} style={styles.avatar} />
      ) : (
        <div
          style={{
            ...styles.avatar,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {title[0]}
        </div>
      )}
      <div style={styles.textContainer}>
        <a style={styles.chatTitleText}>{title}</a>
        {lastMessage && <LastMessage lastMessage={lastMessage} />}
      </div>
    </div>
  );
};

const useStyles = () => {
  return createStyles({
    container: {
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.secondaryContainer,
      paddingRight: 10,
      paddingLeft: 10,
      gap: 6,
      paddingTop: 6,
      paddingBottom: 6,
      maxWidth: 200,
      cursor: "pointer",
    },
    textContainer: {
      display: "flex",
      flexDirection: "column",
      borderBottom: `1px solid ${colors.onSecondaryContainer}`,
      flex: 1,
      minWidth: 0,
    },
    chatTitleText: {
      fontSize: 16,
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
      color: colors.onSecondaryContainer,
    },
    avatar: {
      width: 40,
      height: 40,
      objectFit: "fill",
      borderRadius: 10,
      backgroundColor: "white",
      flexShrink: 0,
    },
  });
};
