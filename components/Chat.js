import { createRef, useEffect, useState } from "react";
import * as md5 from "md5";
import * as jdenticon from "jdenticon";
import { Box } from "@mui/system";
import { io } from "socket.io-client";
import {
  Avatar,
  MainContainer,
  ChatContainer,
  MessageList,
  Message,
  MessageInput,
} from "@chatscope/chat-ui-kit-react";

const user = md5(navigator.userAgent);

export default function Chat({ room }) {
  const [socket, setSocket] = useState(null);
  const [messages, setMessages] = useState([]);
  const fileRef = createRef();
  useEffect(() => {
    const socket = io("/", {
      transports: ["websocket", "polling"],
    });
    socket.on("connect", () => {
      setSocket(socket);
      socket.emit("enter", { room, sender: user }, (messages) => {
        setMessages(messages.map(santizeMsg));
      });
      socket.on("message", (message) => {
        setMessages((v) => [...v, santizeMsg(message)]);
      });
    });
    return () => socket.disconnect();
  }, [room]);
  const handleSend = (message) => {
    socket.emit("message", { room, message });
  };
  const handleUpload = async (file) => {
    const formData = new FormData();
    formData.append("room", room);
    formData.append("file", file);
    try {
      const res = await fetch("/uploads", {
        method: "post",
        body: formData,
      });
      const { filePath, fileName } = await res.json();
      socket.emit("message", {
        room,
        message: `<a target="_blank" href="${filePath}">${fileName}</a>`,
      });
    } catch (err) {}
  };
  return (
    <Box sx={{ maxWidth: "md", mx: "auto" }}>
      <MainContainer style={{ height: "99vh" }}>
        <ChatContainer>
          <MessageList>
            {messages.map((msg) => (
              <Message key={msg.id} model={msg}>
                <Avatar src={genAvatar(msg.sender)} />
              </Message>
            ))}
          </MessageList>
          <MessageInput
            placeholder="Type message here"
            onSend={(text) => handleSend(text)}
            onAttachClick={() => fileRef.current && fileRef.current.click()}
          />
        </ChatContainer>
      </MainContainer>
      <input
        ref={fileRef}
        type="file"
        multiple={false}
        hidden
        onChange={(e) => handleUpload(e.target.files[0])}
      />
    </Box>
  );
}

function santizeMsg(msg) {
  const { id, sentAt, sender, message } = msg;
  const sentDate = new Date(sentAt);
  const sendTime = `${sentDate.getHours()}:${sentDate.getMinutes()}`;
  const direction = sender === user ? 1 : 0;
  return {
    id,
    sendTime,
    message,
    sender,
    direction,
    position: "single",
  };
}
function genAvatar(sender, size = 200) {
  return "data:image/svg+xml;base64," + btoa(jdenticon.toSvg(sender, size));
}
