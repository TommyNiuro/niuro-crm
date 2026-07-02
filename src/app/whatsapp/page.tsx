import { WhatsAppInbox } from "@/components/whatsapp/WhatsAppInbox";
import { ConnectWhatsApp } from "@/components/whatsapp/ConnectWhatsApp";

export default function WhatsAppPage() {
  return (
    <ConnectWhatsApp>
      <WhatsAppInbox />
    </ConnectWhatsApp>
  );
}
