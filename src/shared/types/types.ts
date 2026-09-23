export type ChatPreview = {
  id: string;
  type: "DIALOG" | "CHAT";
  title: string;
  avatarUrl?: string;
  lastMessage?: ChatLastMessage;
};

export type ChatLastMessage =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "voice";
      duration: number;
    }
  | {
      type: "photo";
    }
  | {
      type: "audio";
      audioName: string;
    }
  | {
      type: "video";
    }
  | {
      type: "file";
      fileName: string;
    }
  | {
      type: "call";
    }
  | {
      type: "control";
      text: string;
    }
  | {
      type: "forward";
    }
  | {
      type: "sticker";
    };

export type ChatMessage = {
  id: string;
  senderId: number;
  time: number;
} & (
  | {
      type: "text";
      text: string;
    }
  | {
      type: "voice";
      audioId: string;
      duration: number;
      wave: number[];
    }
  | {
      type: "photo";
      url: string;
    }
  | {
      type: "audio";
      duration?: number;
      url: string;
    }
  | {
      type: "video";
      duration?: number;
      url: string;
    }
  | {
      type: "file";
      fileName: string;
      url: string;
    }
  | {
      type: "call";
    }
);

export type Screen = { type: "chats" } | { type: "chat"; chatId: number };
