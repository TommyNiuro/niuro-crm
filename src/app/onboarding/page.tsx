"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, CheckCircle2, XCircle, ArrowRight, ArrowLeft, PartyPopper } from "lucide-react";

type WaStatus = { bridgeUp?: boolean; dbExists?: boolean; chats?: number; messages?: number };

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [pitch, setPitch] = useState("");
  const [bridgeUrl, setBridgeUrl] = useState("http://localhost:8080");
  const [whatsappDbPath, setWhatsappDbPath] = useState("");
  const [whatsappStoreDbPath, setWhatsappStoreDbPath] = useState("");
  const [crmSyncUrl, setCrmSyncUrl] = useState("");

  const [wa, setWa] = useState<WaStatus | null>(null);
  const [testing, setTesting] = useState(false);

  const testBridge = async () => {
    setTesting(true);
    setWa(null);
    try {
      const r = await fetch("/api/whatsapp/status", { cache: "no-store" });
      setWa(r.ok ? await r.json() : { bridgeUp: false });
    } catch {
      setWa({ bridgeUp: false });
    } finally {
      setTesting(false);
    }
  };

  const finish = async () => {
    setSaving(true);
    setError(null);
    try {
      const r = await fetch("/api/operator", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name, role, email, company, pitch, bridgeUrl, whatsappDbPath, whatsappStoreDbPath, crmSyncUrl,
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || "No se pudo guardar");
      }
      router.push("/");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar");
      setSaving(false);
    }
  };

  const canIdentity = name.trim().length > 0;
  const canCompany = company.trim().length > 0;

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="text-xl">
            {step === 0 && "Bienvenido. Configuremos tu CRM."}
            {step === 1 && "Tu empresa"}
            {step === 2 && "Conectar WhatsApp (opcional)"}
          </CardTitle>
          <CardDescription>
            {step === 0 && "Con quién habla el CRM cuando redacta mensajes en tu nombre."}
            {step === 1 && "Esto alimenta a la IA cuando escribe y califica leads por vos."}
            {step === 2 && "El inbox de WhatsApp necesita un bridge corriendo aparte. Podés saltarlo y configurarlo después."}
          </CardDescription>
          <div className="flex gap-1.5 pt-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className={`h-1 flex-1 rounded-full ${i <= step ? "bg-primary" : "bg-muted"}`} />
            ))}
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {step === 0 && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="name">Tu nombre *</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Tomás" autoFocus />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="role">Tu rol</Label>
                <Input id="role" value={role} onChange={(e) => setRole(e.target.value)} placeholder="Ej: Founder, Ventas" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">Tu email</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vos@empresa.com" />
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="company">Nombre de la empresa *</Label>
                <Input id="company" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Ej: Niuro" autoFocus />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pitch">¿Qué hace tu empresa?</Label>
                <Textarea
                  id="pitch"
                  value={pitch}
                  onChange={(e) => setPitch(e.target.value)}
                  rows={3}
                  placeholder="Ej: staff augmentation de ingenieros de software senior de LATAM para startups en ~48h"
                />
                <p className="text-[11px] text-muted-foreground">Una o dos frases. La IA la usa como contexto al redactar.</p>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="bridge">URL del bridge</Label>
                <Input id="bridge" value={bridgeUrl} onChange={(e) => setBridgeUrl(e.target.value)} placeholder="http://localhost:8080" />
              </div>
              <Button type="button" variant="outline" size="sm" onClick={testBridge} disabled={testing}>
                {testing ? <Loader2 className="animate-spin" /> : null}
                Probar conexión
              </Button>
              {wa && (
                <div className={`flex items-center gap-2 text-sm ${wa.bridgeUp ? "text-success" : "text-muted-foreground"}`}>
                  {wa.bridgeUp ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                  {wa.bridgeUp
                    ? `Bridge conectado${wa.chats ? ` · ${wa.chats} chats` : ""}.`
                    : "Bridge no responde. Instalá y corré el bridge (ver docs/INTEGRATIONS.md), o saltá este paso."}
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">
                El emparejamiento por QR lo hace el bridge (whatsmeow), no el CRM. Si ya tenés el bridge
                corriendo y vinculado en otra máquina/carpeta, no hace falta escanear nada de nuevo.
              </p>
              <div className="space-y-1.5 pt-1">
                <Label htmlFor="wa-db">Ruta a messages.db del bridge (opcional)</Label>
                <Input
                  id="wa-db"
                  value={whatsappDbPath}
                  onChange={(e) => setWhatsappDbPath(e.target.value)}
                  placeholder="/ruta/a/whatsapp-bridge/store/messages.db"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wa-store">Ruta a whatsapp.db del bridge (opcional)</Label>
                <Input
                  id="wa-store"
                  value={whatsappStoreDbPath}
                  onChange={(e) => setWhatsappStoreDbPath(e.target.value)}
                  placeholder="/ruta/a/whatsapp-bridge/store/whatsapp.db"
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Dejalo vacío si el bridge corre en la ubicación default (./data/whatsapp/) o configuralo
                después desde Ajustes. Necesario si corrés el CRM como app empaquetada.
              </p>

              <div className="space-y-1.5 pt-3 border-t border-border">
                <Label htmlFor="sync-url">Sincronizar con otra instancia de Niuro CRM (opcional)</Label>
                <Input
                  id="sync-url"
                  value={crmSyncUrl}
                  onChange={(e) => setCrmSyncUrl(e.target.value)}
                  placeholder="http://localhost:3001"
                />
                <p className="text-[11px] text-muted-foreground">
                  Trae contactos, empresas, deals, propuestas, tickets, actividades, tareas y radar
                  desde esa instancia (solo lectura por ahora). Dejalo vacío para no sincronizar.
                </p>
              </div>
            </>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>

        <CardFooter className="justify-between">
          <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || saving}>
            <ArrowLeft /> Atrás
          </Button>
          {step < 2 ? (
            <Button
              onClick={() => setStep((s) => s + 1)}
              disabled={(step === 0 && !canIdentity) || (step === 1 && !canCompany)}
            >
              Siguiente <ArrowRight />
            </Button>
          ) : (
            <Button onClick={finish} disabled={saving || !canIdentity || !canCompany}>
              {saving ? <Loader2 className="animate-spin" /> : <PartyPopper />} Terminar
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
