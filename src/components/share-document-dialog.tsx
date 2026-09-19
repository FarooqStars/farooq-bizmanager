import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { formatMoney, useCurrency } from "@/hooks/use-currency.ts";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs.tsx";
import { Mail, MessageCircle, Link2, Copy, Check } from "lucide-react";

type DocumentType = "invoice" | "quotation" | "purchase_order" | "payment_reminder" | "delivery_note";

type ShareDocumentDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentType: DocumentType;
  documentId: string;
  documentNumber: string;
  recipientName: string;
  recipientEmail: string;
  recipientPhone: string;
  amount: number;
  dueDate?: string;
  subject?: string;
  bodyTemplate?: string;
};

export default function ShareDocumentDialog({
  open,
  onOpenChange,
  documentType,
  documentId,
  documentNumber,
  recipientName,
  recipientEmail,
  recipientPhone,
  amount,
  dueDate,
  subject: defaultSubject,
  bodyTemplate,
}: ShareDocumentDialogProps) {
  const { currency } = useCurrency();
  const logComm = useMutation(api.communications.logCommunication);
  const [tab, setTab] = useState<"email" | "whatsapp" | "link">("email");
  const [email, setEmail] = useState(recipientEmail);
  const [phone, setPhone] = useState(recipientPhone);
  const [subject, setSubject] = useState(defaultSubject ?? getDefaultSubject(documentType, documentNumber));
  const [message, setMessage] = useState(bodyTemplate ?? getDefaultBody(documentType, documentNumber, recipientName, amount, dueDate, currency));
  const [copied, setCopied] = useState(false);

  const handleSendEmail = async () => {
    if (!email) {
      toast.error("Email address is required");
      return;
    }
    // Open mailto link
    const mailtoUrl = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
    window.open(mailtoUrl, "_blank");

    // Log communication
    await logComm({
      channel: "email",
      documentType,
      documentId,
      documentNumber,
      recipientName,
      recipientContact: email,
      subject,
      message,
    });
    toast.success(`Email composed for ${recipientName}`);
    onOpenChange(false);
  };

  const handleSendWhatsApp = async () => {
    if (!phone) {
      toast.error("Phone number is required");
      return;
    }
    // Clean phone number
    const cleanPhone = phone.replace(/[^0-9+]/g, "");
    const whatsappUrl = `https://wa.me/${cleanPhone.startsWith("+") ? cleanPhone.slice(1) : cleanPhone}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, "_blank");

    // Log communication
    await logComm({
      channel: "whatsapp",
      documentType,
      documentId,
      documentNumber,
      recipientName,
      recipientContact: phone,
      message,
    });
    toast.success(`WhatsApp message opened for ${recipientName}`);
    onOpenChange(false);
  };

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(message);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);

    // Log communication
    await logComm({
      channel: "link",
      documentType,
      documentId,
      documentNumber,
      recipientName,
      recipientContact: "clipboard",
      message,
    });
    toast.success("Message copied to clipboard");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Share {formatDocType(documentType)} {documentNumber}</DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "email" | "whatsapp" | "link")}>
          <TabsList className="w-full">
            <TabsTrigger value="email" className="flex-1 cursor-pointer"><Mail className="w-4 h-4 mr-1.5" /> Email</TabsTrigger>
            <TabsTrigger value="whatsapp" className="flex-1 cursor-pointer"><MessageCircle className="w-4 h-4 mr-1.5" /> WhatsApp</TabsTrigger>
            <TabsTrigger value="link" className="flex-1 cursor-pointer"><Link2 className="w-4 h-4 mr-1.5" /> Copy</TabsTrigger>
          </TabsList>

          <TabsContent value="email" className="space-y-3 mt-3">
            <div className="space-y-1">
              <Label>Recipient Email</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="customer@example.com" />
            </div>
            <div className="space-y-1">
              <Label>Subject</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Message</Label>
              <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={6} />
            </div>
            <Button className="w-full cursor-pointer" onClick={handleSendEmail}>
              <Mail className="w-4 h-4 mr-2" /> Compose Email
            </Button>
          </TabsContent>

          <TabsContent value="whatsapp" className="space-y-3 mt-3">
            <div className="space-y-1">
              <Label>Phone Number (with country code)</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+974 1234 5678" />
            </div>
            <div className="space-y-1">
              <Label>Message</Label>
              <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={6} />
            </div>
            <Button className="w-full cursor-pointer bg-green-600 hover:bg-green-700" onClick={handleSendWhatsApp}>
              <MessageCircle className="w-4 h-4 mr-2" /> Send via WhatsApp
            </Button>
          </TabsContent>

          <TabsContent value="link" className="space-y-3 mt-3">
            <div className="space-y-1">
              <Label>Document Summary (copy to share)</Label>
              <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={8} />
            </div>
            <Button className="w-full cursor-pointer" onClick={handleCopyLink}>
              {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
              {copied ? "Copied!" : "Copy to Clipboard"}
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function formatDocType(type: DocumentType): string {
  const labels: Record<DocumentType, string> = {
    invoice: "Invoice",
    quotation: "Quotation",
    purchase_order: "Purchase Order",
    payment_reminder: "Payment Reminder",
    delivery_note: "Delivery Note",
  };
  return labels[type];
}

function getDefaultSubject(type: DocumentType, number: string): string {
  const labels: Record<DocumentType, string> = {
    invoice: `Invoice ${number}`,
    quotation: `Quotation ${number}`,
    purchase_order: `Purchase Order ${number}`,
    payment_reminder: `Payment Reminder - ${number}`,
    delivery_note: `Delivery Note ${number}`,
  };
  return labels[type];
}

function getDefaultBody(type: DocumentType, number: string, name: string, amount: number, dueDate?: string, currency = "QAR"): string {
  const formattedAmount = formatMoney(amount, currency);

  switch (type) {
    case "invoice":
      return `Dear ${name},\n\nPlease find attached Invoice ${number} for ${formattedAmount}.${dueDate ? `\n\nPayment is due by ${dueDate}.` : ""}\n\nPlease don't hesitate to contact us if you have any questions.\n\nBest regards`;
    case "quotation":
      return `Dear ${name},\n\nPlease find attached Quotation ${number} for ${formattedAmount}.${dueDate ? `\n\nThis quote is valid until ${dueDate}.` : ""}\n\nWe look forward to hearing from you.\n\nBest regards`;
    case "purchase_order":
      return `Dear ${name},\n\nPlease find Purchase Order ${number} for ${formattedAmount}.\n\nPlease confirm receipt and expected delivery date.\n\nBest regards`;
    case "payment_reminder":
      return `Dear ${name},\n\nThis is a friendly reminder that Invoice ${number} for ${formattedAmount} is past due.${dueDate ? ` The payment was due on ${dueDate}.` : ""}\n\nPlease arrange payment at your earliest convenience.\n\nBest regards`;
    case "delivery_note":
      return `Dear ${name},\n\nDelivery Note ${number} is ready for your reference.\n\nBest regards`;
  }
}
