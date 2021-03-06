import { createRef, useCallback, useEffect, useState } from "react";
import useStateRef from "react-usestateref";
import * as md5 from "md5";
import * as jdenticon from "jdenticon";
import axios from "axios";
import Box from "@mui/material/Box";
import LinearProgress from "@mui/material/LinearProgress";
import { io } from "socket.io-client";
import {
  Avatar,
  MainContainer,
  ConversationHeader,
  AvatarGroup,
  ChatContainer,
  MessageList,
  Message,
  MessageInput,
  InfoButton,
} from "@chatscope/chat-ui-kit-react";
import { Remarkable, utils } from "remarkable";

const USER = md5(navigator.userAgent).slice(0, 6);
const FILE_MAX_SIZE = 512 * 1024 * 1024;
const SYSTEM_MSGS = {
  tips: `1. Share url to invite members.
2. If all members quit, the room will be destroyed.
3. All files will be deleted along with the room.
4. Maximum upload file size is 512M.
`,
  fileSizeExceed: `Upload file size exceeded 512M.`,
};

const markd = new Remarkable();

export default function Chat({ room }) {
  const [socket, setSocket] = useState(null);
  const [msgs, setMsgs, msgsRef] = useStateRef([]);
  const [members, setMembers, membersRef] = useStateRef([]);
  const [progress, setProgress] = useState(0);
  const fileRef = createRef();
  useEffect(() => {
    const socket = io("/", {
      transports: ["websocket", "polling"],
    });
    setSocket(socket);
    socket.on("connect", () => {
      socket.emit("enter", { room, user: USER });
    });
    socket.on("message", handleMsg);
    return () => socket.disconnect();
  }, [room, handleMsg]);
  const handleMsg = useCallback(
    (msg) => {
      if (msg.action) {
        const members = membersRef.current;
        const { action } = msg;
        if (action === "listMembers") {
          setMembers(msg.users);
        } else if (action === "addMember") {
          setMembers(
            members.indexOf(msg.user) === -1 ? [...members, msg.user] : members
          );
        } else if (action === "removeMember") {
          setMembers(members.filter((member) => member !== msg.user));
        }
      } else {
        let msgs = msgsRef.current;
        const newMsg = {
          ...msg,
          html: markd.render(msg.message),
          position: "single",
          avatar: getAvatar(msg.user),
          direction: msg.user === USER ? 1 : 0,
        };
        if (msgs.length > 0) {
          const prevMsg = msgs[msgs.length - 1];
          if (prevMsg.user === newMsg.user) {
            if (prevMsg.position === "single") {
              prevMsg.position = "first";
            } else if (prevMsg.position === "last") {
              prevMsg.position = "normal";
            }
            prevMsg.avatar = null;
            newMsg.position = "last";
          }
        }
        msgs = [...msgs, newMsg];
        setMsgs(msgs);
      }
    },
    [membersRef, setMembers, msgsRef, setMsgs]
  );
  const systemMsg = (message) => {
    handleMsg({ id: Date.now(), user: "system", message });
  };
  const handleSend = (message) => {
    socket.emit("chat", message);
  };
  const handleAttachClick = () => {
    if (fileRef.current) fileRef.current.click();
  };
  const handleUpload = async (file) => {
    if (file.size > FILE_MAX_SIZE) {
      systemMsg(SYSTEM_MSGS.fileSizeExceed);
      return;
    }
    const formData = new FormData();
    formData.append("room", room);
    formData.append("file", file);
    try {
      const res = await axios({
        method: "post",
        url: "/uploads",
        data: formData,
        onUploadProgress: (e) => {
          setProgress(parseInt((e.loaded / e.total) * 100));
        },
      });
      setProgress(0);
      const { filePath, fileName } = res.data;
      handleSend(`[${fileName}](${filePath})`);
    } catch (err) {
      setProgress(0);
    }
  };
  return (
    <Box
      sx={{
        maxWidth: "md",
        mx: "auto",
        a: {
          color: "#0269c8",
          borderBottom: "1px solid #d1e9ff",
          textDecoration: "none",
        },
        ".cs-conversation-header__avatar": {
          flexGrow: 1,
        },
        ".cs-message-list": {
          background: "#f1f3f4",
        },
        ".cs-message__content": {
          background: "white !important",
          whiteSpace: "unset",
        },
        ".markdown-body > p": {
          margin: 0,
        },
      }}
    >
      <LinearProgress
        sx={{ visibility: progress > 0 ? "visible" : "hidden" }}
        variant="determinate"
        value={progress}
      />

      <MainContainer style={{ height: "calc(100vh - 25px)" }}>
        <ChatContainer>
          <ConversationHeader>
            <AvatarGroup size="md">
              {members.map((member) => (
                <Avatar key={member} src={getAvatar(member)} />
              ))}
            </AvatarGroup>
            <ConversationHeader.Actions>
              <InfoButton onClick={() => systemMsg(SYSTEM_MSGS.tips)} />
            </ConversationHeader.Actions>
          </ConversationHeader>
          <MessageList style={{ paddingTop: "4px" }}>
            {msgs.map((msg) => (
              <Message key={msg.id} model={msg} avatarSpacer={!msg.avatar}>
                {msg.avatar && <Avatar src={msg.avatar} />}
                <Message.HtmlContent
                  className="markdown-body"
                  html={msg.html}
                />
              </Message>
            ))}
          </MessageList>
          <MessageInput
            placeholder="Type message here"
            onSend={(...args) => handleSend(args[2])}
            onAttachClick={handleAttachClick}
            attachDisabled={progress > 0}
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

const avatarCache = {
  system: "/system.svg",
};
function getAvatar(user, size = 200) {
  if (avatarCache[user]) return avatarCache[user];
  avatarCache[user] =
    "data:image/svg+xml;base64," + btoa(jdenticon.toSvg(user, size));
  return avatarCache[user];
}

markd.renderer.rules.link_open = function (tokens, idx, options /* env */) {
  const title = tokens[idx].title
    ? ' title="' +
      utils.escapeHtml(utils.replaceEntities(tokens[idx].title)) +
      '"'
    : "";
  const target = options.linkTarget
    ? ' target="' + options.linkTarget + '"'
    : "";
  return (
    '<a target="_blank" href="' +
    utils.escapeHtml(tokens[idx].href) +
    '"' +
    title +
    target +
    ">"
  );
};
