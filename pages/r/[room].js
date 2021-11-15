import { useRouter } from "next/router";
import dynamic from "next/dynamic";
const Chat = dynamic(() => import("../../components/Chat"), { ssr: false });

import "@chatscope/chat-ui-kit-styles/dist/default/styles.min.css";

export default function App() {
  const router = useRouter();
  const { room } = router.query;
  return <Chat room={room} />;
}
