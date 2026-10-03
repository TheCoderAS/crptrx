"use client";

import { InfoTip } from "../InfoTip";
import { ChatPopup } from "./ChatPopup";

/** The customer's support chat on their order page. */
export function ChatLauncher({ orderId, hours, startUnread = false }: { orderId: string; hours: string; startUnread?: boolean }) {
  return (
    <ChatPopup
      orderId={orderId}
      side="USER"
      aboveTabBar
      startUnread={startUnread}
      title="Support"
      info={<InfoTip className="text-white/80">{hours}. Messages outside these hours are answered next working day.</InfoTip>}
      subtitle={`Order ${orderId}`}
      empty={<>Questions about this order or payment?<br />Send us a message.</>}
    />
  );
}
